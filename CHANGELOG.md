# Change Log

## v0.0.14
- update: solidity-metrics (show abstract contracts)

## v0.0.13
- new: now integrates [solidity-doppelganger](https://github.com/tintinweb/solidity-doppelganger) detection
- update: dependencies (solidity-metrics, parser, surya)

## v0.0.12
- fixed: report not rendering - #6
- update: showdown to 1.9.1 (due to security issue in 1.9.0)

## v0.0.11
- show progress
- show warnings if no report could be produced because no valid files were found
- safeguard surya calls from breaking the report
- update dependencies

## v0.0.10
- update: `solidity-code-metrics` to 0.0.7 (updating surya to 0.4.1.dev2)

## v0.0.9
- fix: package.json cleanup
- update: `solidity-code-metrics` with solidity v0.6.0 support

## v0.0.8
- Adopt VS Code's 'asWebviewUri' API - #1

## v0.0.7
- new: allow to export the metrics report
- fixed: surya report now shows relative paths
- new: webpack websrc/main.js

## v0.0.6
- fixed "undefined.trim()" when parsing repo fetchHEAD

## v0.0.5  
- added complexity rating

## v0.0.4
- fixed capabilities: create/create2
- added capabilities: delegatecall
- fixed log charts start at 0

## v0.0.3
- new metrics
- new charts
- detects capabilities
- hide avg in charts

## v0.0.1 - v0.0.2
- Initial release
