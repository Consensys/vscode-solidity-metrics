"use strict";
/**
 * @author github.com/tintinweb
 * @license MIT
 *
 *
 * */

/** imports */
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

/** global vars */

/** classdecs */

class InteractiveWebviewGenerator {
  constructor(context, content_folder) {
    this.context = context;
    this.webviewPanels = new Map();
    this.timeout = null;
    this.content_folder = content_folder;
  }

  setNeedsRebuild(uri, needsRebuild) {
    let panel = this.webviewPanels.get(uri);

    if (panel) {
      panel.setNeedsRebuild(needsRebuild);
      this.rebuild();
    }
  }

  getPanel(uri) {
    return this.webviewPanels.get(uri);
  }

  getActivePanels() {
    let panels = [];

    this.webviewPanels.forEach((v) => {
      if (v.getPanel().active) {
        panels.push(v);
      }
    });
    return panels;
  }

  dispose() {
    vscode.commands.executeCommand(
      "setContext",
      "metricsReportActiveContext",
      !!this.getActivePanels().length,
    );
  }

  rebuild() {
    let atLeastOneActive = false;
    this.webviewPanels.forEach((panel) => {
      atLeastOneActive |= panel.getPanel().active;
      if (panel.getNeedsRebuild() && panel.getPanel().visible) {
        this.updateContent(
          panel,
          vscode.workspace.textDocuments.find((doc) => doc.uri == panel.uri),
        );
      }
    });
    vscode.commands.executeCommand(
      "setContext",
      "metricsReportActiveContext",
      atLeastOneActive,
    );
  }

  async revealOrCreatePreview(displayColumn, doc) {
    let that = this;
    return new Promise(function (resolve, reject) {
      let previewPanel = that.webviewPanels.get(doc.uri);

      if (previewPanel) {
        previewPanel.reveal(displayColumn);
      } else {
        previewPanel = that.createPreviewPanel(doc, displayColumn);
        that.webviewPanels.set(doc.uri, previewPanel);
        // when the user closes the tab, remove the panel
        previewPanel
          .getPanel()
          .onDidDispose(
            () =>
              that.webviewPanels.delete(doc.uri) && that.dispose(previewPanel),
            undefined,
            that.context.subscriptions,
          );
        // when the pane becomes visible again, refresh it
        previewPanel.getPanel().onDidChangeViewState((_) => that.rebuild());

        previewPanel
          .getPanel()
          .webview.onDidReceiveMessage(
            (e) => that.handleMessage(previewPanel, e),
            undefined,
            that.context.subscriptions,
          );
      }

      that.updateContent(previewPanel, doc).then((previewPanel) => {
        resolve(previewPanel);
      });
    });
  }

  handleMessage(previewPanel, message) {
    console.log(`Message received from the webview: ${message.command}`);

    switch (message.command) {
      case "onPageLoaded":
        previewPanel.onPageLoaded(message);
        break;
      case "onClick":
        previewPanel.onClick(message);
        break;
      case "onDblClick":
        console.log("dblclick --> navigate to code location");
        break;
      default:
        previewPanel.handleMessage(message);
      //forward unhandled messages to previewpanel
    }
  }

  createPreviewPanel(doc, displayColumn) {
    let previewTitle = `Solidity Metrics: '${path.basename(doc.fileName)}'`;

    let webViewPanel = vscode.window.createWebviewPanel(
      "metricsView",
      previewTitle,
      displayColumn,
      {
        enableFindWidget: false,
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, "content")),
        ],
      },
    );

    webViewPanel.iconPath = vscode.Uri.file(
      this.context.asAbsolutePath(path.join("content", "icon.png")),
    );

    return new PreviewPanel(this, doc.uri, webViewPanel);
  }

  async updateContent(previewPanel, doc) {
    return new Promise(async (resolve, reject) => {
      if (!previewPanel.getPanel().webview.html) {
        previewPanel.getPanel().webview.html = "Please wait...";
      }
      previewPanel.setNeedsRebuild(false);
      previewPanel.getPanel().webview.html = await this.getPreviewHtml(
        previewPanel,
        doc,
      );
      return resolve(previewPanel);
    });
  }

  async getPreviewTemplate(context, templateName) {
    let previewPath = context.asAbsolutePath(
      path.join(this.content_folder, templateName),
    );

    return new Promise((resolve, reject) => {
      fs.readFile(previewPath, "utf8", function (err, data) {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  async getPreviewHtml(previewPanel, doc) {
    let templateHtml = await this.getPreviewTemplate(
      this.context,
      "index.html",
    );

    templateHtml = templateHtml
      .replace(/<script .*?src="(.+)">/g, (scriptTag, srcPath) => {
        let resource = vscode.Uri.file(
          path.join(
            this.context.extensionPath,
            this.content_folder,
            ...srcPath.split("/"),
          ),
        );
        return `<script src="${previewPanel.getPanel().webview.asWebviewUri(resource)}">`;
      })
      .replace(
        /<link rel="stylesheet" type="text\/css" href="(.+)"\/>/g,
        (scriptTag, srcPath) => {
          let resource = vscode.Uri.file(
            path.join(
              this.context.extensionPath,
              this.content_folder,
              ...srcPath.split("/"),
            ),
          );
          return `<link rel="stylesheet" href="${previewPanel.getPanel().webview.asWebviewUri(resource)}"/>`;
        },
      );
    return templateHtml;
  }
}

class PreviewPanel {
  constructor(parent, uri, panel) {
    this.parent = parent;
    this.needsRebuild = false;
    this.uri = uri;
    this.panel = panel;

    this.contextData = null;

    this.lastRender = null;
  }

  reveal(displayColumn) {
    this.panel.reveal(displayColumn);
  }

  setNeedsRebuild(needsRebuild) {
    this.needsRebuild = needsRebuild;
  }

  getNeedsRebuild() {
    return this.needsRebuild;
  }

  getPanel() {
    return this.panel;
  }

  getWebView() {
    return this.panel.webview;
  }

  getContextData() {
    return this.contextData;
  }

  setContextData(contextData) {
    this.contextData = contextData;
  }

  renderReport(data) {
    this.panel.webview.postMessage({
      command: "renderReport",
      value: data,
    });
  }

  handleMessage(message) {
    console.warn("Unexpected command: " + message.command);
  }

  onPageLoaded(message) {
    //re-render just to make sure we're not stuck on the loading page
    this.renderReport(this.contextData);
  }

  onClick(message) {
    console.debug(message);
  }
}

module.exports = {
  InteractiveWebviewGenerator: InteractiveWebviewGenerator,
};
