'use strict';
/** 
 * @author github.com/tintinweb
 * @license MIT
 * 
 * 
 * */

/** imports */
const vscode = require("vscode");
const settings = require('./settings');
const { InteractiveWebviewGenerator } = require('./features/interactiveWebview.js');
const { SolidityMetricsContainer } = require('solidity-code-metrics');
const fs = require('fs');
const path = require('path');

/** funcdecs */
function getWsGitInfo(rootPath) {
    let branch = "unknown_branch";
    let commit = "unknown_commit";
    let remote = "";

    let basePath = rootPath;

    if (fs.existsSync(basePath + "/.git/HEAD")) {
        let branchFile = fs.readFileSync(basePath + "/.git/HEAD").toString('utf-8').trim();
        if (branchFile && branchFile.startsWith("ref: ")) {
            branchFile = branchFile.replace("ref: ", "");

            let branchFileNormalized = path.normalize(basePath + "/.git/" + branchFile);

            if (branchFileNormalized.startsWith(basePath) && fs.existsSync(branchFileNormalized)) {
                branch = branchFile.replace("refs/heads/", "");
                commit = fs.readFileSync(branchFileNormalized).toString('utf-8').trim();
                if (fs.existsSync(basePath + "/.git/FETCH_HEAD")) {
                    let fetchHeadData = fs.readFileSync(basePath + "/.git/FETCH_HEAD").toString('utf-8').trim().split("\n");
                    if (fetchHeadData.lenght) {
                        let fetchHead = fetchHeadData.find(line => line.startsWith(commit)) || fetchHeadData.find(line => line.includes(`branch '${branch}' of `)) || fetchHeadData[0];
                        remote = fetchHead.trim().split(/[\s]+/).pop();
                    }
                }
            }


        }
    }
    return {
        branch: branch,
        commit: commit,
        remote: remote
    };
}


function previewMarkdown(document, content) {
    vscode.workspace.openTextDocument({ content: content, language: "markdown" })
        .then(doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside));
}

class AnonymousDocument {
    constructor(fileName, uri) {
        this.uri = uri || "";
        this.fileName = fileName || "";
    }
}

function previewHtml(webView, document, markdownTemplate, jsonData, dotGraphs) {

    webView.revealOrCreatePreview(vscode.ViewColumn.Beside, document)
        .then(webpanel => {
            let data = {
                markdownTemplate: markdownTemplate,
                jsonData: jsonData,
                dotGraphs: dotGraphs
            };
            webpanel.setContextData(data);
            webpanel.renderReport(data);
            /*
            webpanel.getWebView().postMessage({
                    command:"renderReport", 
                    value: data
                });
            */
        });
}

function exportCurrentAsHtml(context, webView) {

    let previewPanels = webView.getActivePanels();

    previewPanels.forEach(p => {
        let msgValue = p.getContextData();
        let wsfolder = vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri.fsPath : ""
        //export report to workspace

        vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(wsfolder, "solidity-metrics.html")),
            saveLabel: "Export"
        }).then(fileUri => {
            if (!fileUri) {
                return; //abort, nothing selected
            }

            let result = { 'index': '', 'js': [], 'css': [] };
            let srcFiles = [
                'index.html',

                path.join('js', 'Chart.bundle.min.js'),
                path.join('js', 'chartjs-plugin-colorschemes.min.js'),


                path.join('js', 'showdown.min.js'),
                path.join('js', 'showdown-table.min.js'),
                path.join('css', 'github-markdown.css'),

                path.join('js', 'd3graphviz', 'viz.js'),
                path.join('js', 'd3graphviz', 'd3.min.js'),
                path.join('js', 'd3graphviz', 'd3-graphviz.min.js'),

                'main.js',
            ];

            srcFiles.forEach(f => {
                switch (f.split('.').pop()) {
                    case 'js': result.js.push(fs.readFileSync(path.join(context.extensionPath, "content", f), "utf8")); break;
                    case 'html': result.index = fs.readFileSync(path.join(context.extensionPath, "content", f), "utf8"); break;
                    case 'css': result.css.push(fs.readFileSync(path.join(context.extensionPath, "content", f), "utf8")); break;
                }
            });

            result.index = result.index
                .replace(/<script .*?src="(.+)"><\/script>/g, "")
                .replace(/<link.*\/>/g, "")
                .replace(/<!-- .* -->/g, "")
                .replace(/\s{5,}/g, '');

            let staticJsCss = `
        <style>
            ${result.css.join("\n<!-- -->\n")}
        </style>
        <script>
            ${result.js.join("\n</script><script>\n")}
        </script>
        <script>
            let staticMetrics = ${JSON.stringify(msgValue)};

            window.postMessage({"command":"renderReport", value:staticMetrics}, '*')
        </script>`;

            fs.writeFile(fileUri.fsPath, result.index.replace("<!--/*** %%static_metrics%% ***/-->", staticJsCss), function (err) {
                if (err) {
                    vscode.window.showErrorMessage('Export failed:' + err);
                    console.log(err);
                    return;
                }
                vscode.window.showInformationMessage('Export successful → ' + fileUri.fsPath);
            });
        });
    });
}

/** event funcs */
function onActivate(context) {
    const webView = new InteractiveWebviewGenerator(context, "content");

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.activeFile.report', (args) => {

            let document = vscode.window.activeTextEditor.document;
            let selectedWorkspace = vscode.workspace.getWorkspaceFolder(document.uri);
            let wsPath = selectedWorkspace ? selectedWorkspace.uri.fsPath : path.dirname(document.uri.fsPath);

            let metrics = new SolidityMetricsContainer(selectedWorkspace ? selectedWorkspace.name : vscode.workspace.name, {
                basePath: wsPath + "/",
                inputFileGlobExclusions: settings.extensionConfig().file.exclusions.glob,
                inputFileGlob: undefined,
                inputFileGlobLimit: settings.extensionConfig().file.limit,
                debug: settings.extensionConfig().debug,
                repoInfo: getWsGitInfo(wsPath)
            });
            metrics.inputFileGlob = document.fileName.replace(metrics.basePath, "");

            metrics.analyze(document.fileName);

            if (!metrics.seenFiles.length) {
                vscode.window.showWarningMessage("Not a valid solidity source file.");
                return;
            }

            let dotGraphs = {};
            try {
                dotGraphs = metrics.getDotGraphs();
            } catch (error) {
                console.log(error);
            }

            metrics.generateReportMarkdown().then(markdown => {
                previewHtml(webView,
                    document,
                    markdown,
                    metrics.totals(),
                    dotGraphs);
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.activeFile.exportHtml', (args) => {
            exportCurrentAsHtml(context, webView);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.workspace.report', async (args) => {

            vscode.workspace.workspaceFolders.forEach(selectedWorkspace => {
                let metrics = new SolidityMetricsContainer(selectedWorkspace.name, {
                    basePath: selectedWorkspace.uri.fsPath + "/",
                    inputFileGlobExclusions: settings.extensionConfig().file.exclusions.glob,
                    inputFileGlob: "**/*.sol",
                    inputFileGlobLimit: settings.extensionConfig().file.limit,
                    debug: settings.extensionConfig().debug,
                    repoInfo: getWsGitInfo(selectedWorkspace.uri.fsPath)
                });

                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: `Solidity-Metrics: crunching numbers...`,
                    cancellable: false
                }, async (progress, token) => {
                    token.onCancellationRequested(() => {
                        console.log("User canceled the long running operation");
                    });

                    await vscode.workspace.findFiles(
                        new vscode.RelativePattern(selectedWorkspace, metrics.inputFileGlob),
                        new vscode.RelativePattern(selectedWorkspace, metrics.inputFileGlobExclusions),
                        metrics.inputFileGlobLimit
                    ).then(uris => {
                        uris.forEach(uri => {
                            metrics.analyze(uri.fsPath);
                            progress.report({ increment: 1 });
                        });
                    });

                    await vscode.workspace.findFiles(
                        new vscode.RelativePattern(selectedWorkspace, "**/truffle*.js"),
                        new vscode.RelativePattern(selectedWorkspace, metrics.inputFileGlobExclusions),
                        metrics.inputFileGlobLimit
                    ).then(uris => {
                        uris.forEach(uri => {
                            if (uri.fsPath.endsWith(".js")) {
                                metrics.addTruffleProjectLocation(uri.fsPath);
                                progress.report({ increment: 1 });
                            }
                        });
                    });

                    // {**/node_modules,**/mock*,**/test*,**/migrations,**/Migrations.sol}
                    let excludeFilesGlobArray = metrics.inputFileGlobExclusions.replace("{", "").replace("}", "").split(",").map(g => g.endsWith(".sol") ? g : g + "/**/*.sol");

                    await vscode.workspace.findFiles(
                        new vscode.RelativePattern(selectedWorkspace, "{" + excludeFilesGlobArray.join(",") + "}"),
                        undefined,
                        metrics.excludeFileGlobLimit
                    ).then(uris => {
                        uris.forEach(uri => {
                            metrics.addExcludedFile(uri.fsPath);
                            progress.report({ increment: 1 });
                        });
                    });

                    if (!metrics.seenFiles.length) {
                        vscode.window.showWarningMessage("No valid solidity source files found.");
                        return;
                    }
                    progress.report({ increment: 10 });
                    let dotGraphs = {};
                    try {
                        dotGraphs = metrics.getDotGraphs();
                    } catch (error) {
                        console.log(error);
                    }
                    progress.report({ increment: 10 });
                    metrics.generateReportMarkdown().then(markdown => {
                        progress.report({ increment: 1 });
                        previewHtml(webView,
                            new AnonymousDocument(selectedWorkspace.name, selectedWorkspace.name),
                            markdown,
                            metrics.totals(),
                            dotGraphs);
                    });


                });
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.contextMenu.report', async (clickedFileUri, selectedFiles) => {

            if (!clickedFileUri) {
                return;  // no file selected, skip 
            }
            let selectedWorkspace = vscode.workspace.getWorkspaceFolder(clickedFileUri);
            let wsPath = selectedWorkspace ? selectedWorkspace.uri.fsPath : fs.statSync(clickedFileUri.fsPath).isDirectory() ? clickedFileUri.fsPath : path.dirname(clickedFileUri.fsPath);

            let metrics = new SolidityMetricsContainer(selectedWorkspace ? selectedWorkspace.name : vscode.workspace.name, {
                basePath: wsPath + "/",
                inputFileGlobExclusions: settings.extensionConfig().file.exclusions.glob,
                inputFileGlob: undefined,
                inputFileGlobLimit: settings.extensionConfig().file.limit,
                debug: settings.extensionConfig().debug,
                repoInfo: getWsGitInfo(wsPath)
            });
            metrics.inputFileGlob = "{" + selectedFiles.map(x => {
                if (x.fsPath.endsWith(".sol")) {
                    return x.fsPath.replace(metrics.basePath, "");
                }
                else if (x.fsPath == wsPath || x.fsPath == metrics.basePath) {
                    return "**/*.sol"; //special case: workspace selected
                }
                return x.fsPath.replace(metrics.basePath, "") + "/**/*.sol";
            }).join(",") + "}";

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Solidity-Metrics: crunching numbers...`,
                cancellable: false
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    console.log("User canceled the long running operation");
                });

                //progress.report({ increment: 0 });
                await vscode.workspace.findFiles(
                    new vscode.RelativePattern(selectedWorkspace, metrics.inputFileGlob),
                    new vscode.RelativePattern(selectedWorkspace, metrics.inputFileGlobExclusions),
                    metrics.inputFileGlobLimit)
                    .then(uris => {
                        uris.forEach(uri => {
                            metrics.analyze(uri.fsPath);
                            progress.report({ increment: 1 });
                        });
                    });

                //discover truffle projects
                let truffleFileGlob = "{" + selectedFiles.map(x => x.fsPath.endsWith(".sol") ? x.fsPath.replace(metrics.basePath, "") : x.fsPath.replace(metrics.basePath, "") + "/**/truffle*.js").join(",") + "}";


                await vscode.workspace.findFiles(
                    new vscode.RelativePattern(selectedWorkspace, truffleFileGlob),
                    new vscode.RelativePattern(selectedWorkspace, metrics.inputFileGlobExclusions),
                    metrics.inputFileGlobLimit
                ).then(uris => {
                    uris.forEach(uri => {
                        if (uri.fsPath.endsWith(".js")) {
                            metrics.addTruffleProjectLocation(uri.fsPath);
                            progress.report({ increment: 1 });
                        }
                    });
                });
                //list excluded files

                // {**/node_modules,**/mock*,**/test*,**/migrations,**/Migrations.sol}
                let excludeFilesGlobArray = metrics.inputFileGlobExclusions.replace("{", "").replace("}", "").split(",");
                let excludeFilesGlob = [];

                for (let sFile of selectedFiles) {
                    if (sFile.fsPath.endsWith(".sol")) {
                        //ignore explicitly selected files
                        continue;
                    }
                    for (let g of excludeFilesGlobArray) {
                        excludeFilesGlob.push(sFile.fsPath.replace(metrics.basePath, "") + "/" + g + "/**/*.sol");
                    }
                }
                if (excludeFilesGlob.length) {
                    await vscode.workspace.findFiles(
                        new vscode.RelativePattern(selectedWorkspace, "{" + excludeFilesGlob.join(",") + "}"),
                        undefined,
                        metrics.excludeFileGlobLimit
                    ).then(uris => {
                        uris.forEach(uri => {
                            metrics.addExcludedFile(uri.fsPath);
                            progress.report({ increment: 1 });
                        });
                    });
                }

                if (!metrics.seenFiles.length) {
                    vscode.window.showWarningMessage("No valid solidity source files found.");
                    return;
                }

                let dotGraphs = {};
                try {
                    dotGraphs = metrics.getDotGraphs();
                } catch (error) {
                    console.log(error);
                }

                metrics.generateReportMarkdown().then(markdown => {
                    previewHtml(webView,
                        new AnonymousDocument(selectedWorkspace.name, selectedWorkspace.name),
                        markdown,
                        metrics.totals(),
                        dotGraphs);
                });
            });
        })
    );
}

/* exports */
exports.activate = onActivate;