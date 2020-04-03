'use strict';
/** 
 * @author github.com/tintinweb
 * @license MIT
 * 
 * 
 * */

const vscode = require('vscode');

function extensionConfig() {
    return vscode.workspace.getConfiguration('solidity-metrics');
}

function extension() {
    return vscode.extensions.getExtension('tintinweb.solidity-metrics');
}

module.exports = {
    extensionConfig: extensionConfig,
    extension: extension,
};