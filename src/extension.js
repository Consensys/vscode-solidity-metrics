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
const {SolidityMetricsContainer} = require('solidity-code-metrics');
const fs = require('fs');
const path = require('path');

/** funcdecs */
function getWsGitInfo(){
    let branch = "unknown_branch";
    let commit = "unknown_commit";
    let remote = "";

    let basePath = vscode.workspace.rootPath; 

    if (fs.existsSync(basePath + "/.git/HEAD")){
        let branchFile = fs.readFileSync(basePath + "/.git/HEAD").toString('utf-8').trim();
        if(branchFile && branchFile.startsWith("ref: ")){
            branchFile = branchFile.replace("ref: ","");

            let branchFileNormalized = path.normalize(basePath + "/.git/" + branchFile);

            if (branchFileNormalized.startsWith(basePath) && fs.existsSync(branchFileNormalized)){
                branch = branchFile.replace("refs/heads/","");
                commit = fs.readFileSync(branchFileNormalized).toString('utf-8').trim(); 
                if(fs.existsSync(basePath + "/.git/FETCH_HEAD")){
                    let fetchHeadData = fs.readFileSync(basePath + "/.git/FETCH_HEAD").toString('utf-8').trim().split("\n");
                    if(fetchHeadData.lenght){
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


function previewMarkdown(document, content){
    vscode.workspace.openTextDocument({content: content, language: "markdown"})
        .then(doc => vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside));
}

class AnonymousDocument {
    constructor(fileName,uri){
        this.uri = uri || "";
        this.fileName = fileName || "";
    }
}

function previewHtml(webView, document, markdownTemplate, jsonData, dotGraphs){

    webView.revealOrCreatePreview(vscode.ViewColumn.Beside, document)
        .then(webpanel => {
            let data = {
                markdownTemplate:markdownTemplate,
                jsonData:jsonData,
                dotGraphs:dotGraphs
            };
            webpanel.setContextData(data);
            webpanel.getPanel().postMessage({
                    command:"renderReport", 
                    value: data
                });
            //webpanel.renderDot(options.content)
            //handle messages?
            //webpanel.handleMessages = function (message) {} 
        });
}

function exportCurrentAsHtml(context, webView){

    let previewPanels = webView.getActivePanels();

    previewPanels.forEach(p => {
        let msgValue = p.getContextData();

        //export report to workspace

        vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(vscode.workspace.rootPath,"solidity-metrics.html")),
            saveLabel: "Export"
        }).then(fileUri => {
            if (!fileUri) {
                return; //abort, nothing selected
            }

            let result = {'index':'', 'js':[], 'css':[] };
            let srcFiles = [
                'index.html',
                
                path.join('js', 'Chart.bundle.min.js'), 
                path.join('js', 'chartjs-plugin-colorschemes.min.js'), 

                
                path.join('js', 'showdown.min.js'), 
                path.join('js', 'showdown-table.min.js'), 
                path.join('css','github-markdown.css'),
                
                path.join('js', 'd3graphviz', 'viz.js'), 
                path.join('js', 'd3graphviz', 'd3.min.js'), 
                path.join('js', 'd3graphviz', 'd3-graphviz.min.js'), 
                
                'main.js', 
            ];
            
            srcFiles.forEach(f => {
                switch(f.split('.').pop()){
                    case 'js': result.js.push(fs.readFileSync(path.join(context.extensionPath, "content", f), "utf8")); break;
                    case 'html': result.index = fs.readFileSync(path.join(context.extensionPath, "content", f), "utf8"); break;
                    case 'css': result.css.push(fs.readFileSync(path.join(context.extensionPath, "content", f), "utf8")); break;
                }
            });

            result.index = result.index
                .replace(/<script .*?src="(.+)"><\/script>/g,"")
                .replace(/<link.*\/>/g,"")
                .replace(/<!-- .* -->/g, "")
                .replace(/\s{5,}/g,'');

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

            fs.writeFile(fileUri.fsPath, result.index.replace("<!--/*** %%static_metrics%% ***/-->", staticJsCss), function(err) {
                if(err) {
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
                metrics.totals(),
                metrics.getDotGraphs());
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('solidity-metrics.activeFile.exportHtml', (args) => {
            exportCurrentAsHtml(context, webView);
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
                new AnonymousDocument(vscode.workspace.name, vscode.workspace.name), 
                metrics.generateReportMarkdown(), 
                metrics.totals(),
                metrics.getDotGraphs());
            
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
                new AnonymousDocument(vscode.workspace.name, vscode.workspace.name), 
                metrics.generateReportMarkdown(), 
                metrics.totals(),
                metrics.getDotGraphs());

        })
    );
}

/* exports */
exports.activate = onActivate;