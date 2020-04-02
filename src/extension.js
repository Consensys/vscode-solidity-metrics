/** 
 * @author github.com/tintinweb
 * @license MIT
 * 
  * */


/** imports */
const vscode = require("vscode")
const {InteractiveWebviewGenerator} = require('./features/interactiveWebview.js')
const SOLIDITY = 'solidity'

const {SolidityMetricsContainer} = require('./features/metrics')

/** global vars */
const config = vscode.workspace.getConfiguration('solidity-metrics');

/** classdecs */


/** funcdecs */

function previewMarkdown(document, content){
    vscode.workspace.openTextDocument({content: content, language: "markdown"})
        .then(doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside))
}

class AnonymouseDocument {
    constructor(fileName,uri){
        this.uri = uri || ""
        this.fileName = fileName || ""
    }
}

function previewHtml(webView, document, markdownTemplate, jsonData){

    console.log({
        command:"renderReport", 
        value:{
            markdownTemplate:markdownTemplate,
            jsonData:jsonData
        }
    })

    webView.revealOrCreatePreview(vscode.ViewColumn.Beside, document)
        .then(webpanel => {
            console.log("webpanel")
            webpanel.postMessage({
                    command:"renderReport", 
                    value:{
                        markdownTemplate:markdownTemplate,
                        jsonData:jsonData
                    }
                })
            console.log("webpanel end")
            //webpanel.renderDot(options.content)
            //handle messages?
            //webpanel.handleMessages = function (message) {} 
        })
}

/** event funcs */
function onActivate(context) {
    const webView = new InteractiveWebviewGenerator(context, "content");

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.activeFile.report', (args) => {

            let document = vscode.window.activeTextEditor.document
            let metrics = new SolidityMetricsContainer(vscode.workspace.name, {
                basePath:vscode.workspace.rootPath + "/",
                inputFileGlobExclusions:config.file.exclusions.glob,
                inputFileGlob: undefined,
                inputFileGlobLimit: config.file.limit
            });
            metrics.inputFileGlob = document.fileName.replace(metrics.basePath,"")

            metrics.analyze(document.fileName)
            previewHtml(webView, document, metrics.generateReportMarkdown(), metrics.totals())
            
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.workspace.report', async (args) => {

            let metrics = new SolidityMetricsContainer(vscode.workspace.name, {
                basePath:vscode.workspace.rootPath + "/",
                inputFileGlobExclusions:config.file.exclusions.glob,
                inputFileGlob:"**/*.sol",
                inputFileGlobLimit: config.file.limit
            });

            await vscode.workspace.findFiles(metrics.inputFileGlob, metrics.inputFileGlobExclusions, metrics.inputFileGlobLimit)
                .then(uris => {
                    uris.forEach(uri => {
                        metrics.analyze(uri.path)
                    })
                })

            await vscode.workspace.findFiles("**/truffle*.js", metrics.inputFileGlobExclusions, metrics.inputFileGlobLimit)
                .then(uris => {
                    uris.forEach(uri => {
                        metrics.addTruffleProjectLocation(uri.path)
                    })
                })

            previewHtml(webView, new AnonymouseDocument("workspace","workspace"), metrics.generateReportMarkdown(), metrics.totals())
            
        })
    )

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.contextMenu.report', async (clickedFile, selectedFiles) => {

            let metrics = new SolidityMetricsContainer(vscode.workspace.name, {
                basePath:vscode.workspace.rootPath + "/",
                inputFileGlobExclusions:config.file.exclusions.glob,
                inputFileGlob: undefined,
                inputFileGlobLimit: config.file.limit
            });
            metrics.inputFileGlob = "{" + selectedFiles.map(x => x.path.endsWith(".sol") ? x.path.replace(metrics.basePath,"") : x.path.replace(metrics.basePath,"") + "/**/*.sol").join(",")  + "}"

            //todo fixit!
            await vscode.workspace.findFiles(metrics.inputFileGlob, metrics.inputFileGlobExclusions, metrics.inputFileGlobLimit)
                .then(uris => {
                    uris.forEach(uri => {
                        metrics.analyze(uri.path)
                    })
                })

            let truffleFileGlob = "{" + selectedFiles.map(x => x.path.endsWith(".sol") ? x.path.replace(metrics.basePath,"") : x.path.replace(metrics.basePath,"") + "/**/truffle*.js").join(",")  + "}"

            await vscode.workspace.findFiles(truffleFileGlob, metrics.inputFileGlobExclusions, metrics.inputFileGlobLimit)
                .then(uris => {
                    uris.forEach(uri => {
                        metrics.addTruffleProjectLocation(uri.path)
                    })
                })

            previewHtml(webView, new AnonymouseDocument("fromContextMenu","fromContextMenu"), metrics.generateReportMarkdown(), metrics.totals())

        })
    )
}

/* exports */
exports.activate = onActivate;