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
const {InteractiveWebviewGenerator} = require('./features/interactiveWebview.js');
const {SolidityMetricsContainer} = require('./features/metrics');
const fs = require('fs');
const path = require('path');


/** funcdecs */

function getWsGitInfo(){
    let branch = "unknown branch";
    let commit = "unknown commit#";

    let basePath = vscode.workspace.rootPath; 

    if (fs.existsSync(basePath + "/.git/HEAD")){
        let branchFile = fs.readFileSync(basePath + "/.git/HEAD").toString('utf-8').trim();
        if(branchFile && branchFile.startsWith("ref: ")){
            branchFile = branchFile.replace("ref: ","");

            let branchFileNormalized = path.normalize(basePath + "/.git/" + branchFile);

            if (branchFileNormalized.startsWith(basePath) && fs.existsSync(branchFileNormalized)){
                branch = branchFile.replace("refs/heads/","");
                commit = fs.readFileSync(branchFileNormalized).toString('utf-8').trim(); 
            }
        }
    }
    return {
        branch: branch,
        commit: commit
    };
}

function previewMarkdown(document, content){
    vscode.workspace.openTextDocument({content: content, language: "markdown"})
        .then(doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside));
}

class AnonymouseDocument {
    constructor(fileName,uri){
        this.uri = uri || "";
        this.fileName = fileName || "";
    }
}

function previewHtml(webView, document, markdownTemplate, jsonData){

    console.log({
        command:"renderReport", 
        value:{
            markdownTemplate:markdownTemplate,
            jsonData:jsonData
        }
    });

    webView.revealOrCreatePreview(vscode.ViewColumn.Beside, document)
        .then(webpanel => {
            webpanel.getPanel().postMessage({
                    command:"renderReport", 
                    value:{
                        markdownTemplate:markdownTemplate,
                        jsonData:jsonData
                    }
                });
            //webpanel.renderDot(options.content)
            //handle messages?
            //webpanel.handleMessages = function (message) {} 
        });
}

/** event funcs */
function onActivate(context) {
    const webView = new InteractiveWebviewGenerator(context, "content");

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.activeFile.report', (args) => {

            let document = vscode.window.activeTextEditor.document;
            let metrics = new SolidityMetricsContainer(vscode.workspace.name, {
                basePath:vscode.workspace.rootPath + "/",
                inputFileGlobExclusions:settings.extensionConfig().file.exclusions.glob,
                inputFileGlob: undefined,
                inputFileGlobLimit: settings.extensionConfig().file.limit,
                debug:settings.extensionConfig().debug,
                repoInfo: getWsGitInfo()
            });
            metrics.inputFileGlob = document.fileName.replace(metrics.basePath,"");

            metrics.analyze(document.fileName);
            previewHtml(webView, 
                document, 
                metrics.generateReportMarkdown(), 
                metrics.totals());
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.workspace.report', async (args) => {

            let metrics = new SolidityMetricsContainer(vscode.workspace.name, {
                basePath:vscode.workspace.rootPath + "/",
                inputFileGlobExclusions:settings.extensionConfig().file.exclusions.glob,
                inputFileGlob:"**/*.sol",
                inputFileGlobLimit: settings.extensionConfig().file.limit,
                debug:settings.extensionConfig().debug,
                repoInfo: getWsGitInfo()
            });

            await vscode.workspace.findFiles(metrics.inputFileGlob, metrics.inputFileGlobExclusions, metrics.inputFileGlobLimit)
                .then(uris => {
                    uris.forEach(uri => {
                        metrics.analyze(uri.fsPath);
                    });
                });

            await vscode.workspace.findFiles("**/truffle*.js", metrics.inputFileGlobExclusions, metrics.inputFileGlobLimit)
                .then(uris => {
                    uris.forEach(uri => {
                        if(uri.fsPath.endsWith(".js")){
                            metrics.addTruffleProjectLocation(uri.fsPath);
                        }
                    });
                });

            // {**/node_modules,**/mock*,**/test*,**/migrations,**/Migrations.sol}
            let excludeFilesGlobArray = metrics.inputFileGlobExclusions.replace("{","").replace("}","").split(",").map(g => g.endsWith(".sol") ? g : g + "/**/*.sol");

            await vscode.workspace.findFiles("{" + excludeFilesGlobArray.join(",") + "}", undefined, metrics.excludeFileGlobLimit) 
                .then(uris => {
                    uris.forEach(uri => {
                        metrics.addExcludedFile(uri.fsPath);
                    });
                });
            

            previewHtml(webView, 
                new AnonymouseDocument("workspace","workspace"), 
                metrics.generateReportMarkdown(), 
                metrics.totals());
            
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.contextMenu.report', async (clickedFile, selectedFiles) => {

            let metrics = new SolidityMetricsContainer(vscode.workspace.name, {
                basePath:vscode.workspace.rootPath + "/",
                inputFileGlobExclusions:settings.extensionConfig().file.exclusions.glob,
                inputFileGlob: undefined,
                inputFileGlobLimit: settings.extensionConfig().file.limit,
                debug:settings.extensionConfig().debug,
                repoInfo: getWsGitInfo()
            });
            metrics.inputFileGlob = "{" + selectedFiles.map(x => x.fsPath.endsWith(".sol") ? x.fsPath.replace(metrics.basePath,"") : x.fsPath.replace(metrics.basePath,"") + "/**/*.sol").join(",")  + "}";

            //@todo fixit!
            await vscode.workspace.findFiles(metrics.inputFileGlob, metrics.inputFileGlobExclusions, metrics.inputFileGlobLimit)
                .then(uris => {
                    uris.forEach(uri => {
                        metrics.analyze(uri.fsPath);
                    });
                });

            //discover truffle projects
            let truffleFileGlob = "{" + selectedFiles.map(x => x.fsPath.endsWith(".sol") ? x.fsPath.replace(metrics.basePath,"") : x.fsPath.replace(metrics.basePath,"") + "/**/truffle*.js").join(",")  + "}";

            await vscode.workspace.findFiles(truffleFileGlob, metrics.inputFileGlobExclusions, metrics.inputFileGlobLimit)
                .then(uris => {
                    uris.forEach(uri => {
                        if(uri.fsPath.endsWith(".js")){
                            metrics.addTruffleProjectLocation(uri.fsPath);
                        }
                    });
                });
            //list excluded files

            // {**/node_modules,**/mock*,**/test*,**/migrations,**/Migrations.sol}
            let excludeFilesGlobArray = metrics.inputFileGlobExclusions.replace("{","").replace("}","").split(",");
            let excludeFilesGlob = [];

            for(let sFile of selectedFiles){
                if(sFile.fsPath.endsWith(".sol")){
                    //ignore explicitly selected files
                    continue;
                }
                for(let g of excludeFilesGlobArray) {
                    excludeFilesGlob.push(sFile.fsPath.replace(metrics.basePath,"") + "/" + g + "/**/*.sol");
                }
            }
            if(excludeFilesGlob.length){
                await vscode.workspace.findFiles("{" + excludeFilesGlob.join(",") + "}", undefined, metrics.excludeFileGlobLimit) 
                    .then(uris => {
                        uris.forEach(uri => {
                            metrics.addExcludedFile(uri.fsPath);
                        });
                    });
            }
            

            previewHtml(webView, 
                new AnonymouseDocument("fromContextMenu","fromContextMenu"), 
                metrics.generateReportMarkdown(), 
                metrics.totals());

        })
    );
}

/* exports */
exports.activate = onActivate;