/** 
 * @author github.com/tintinweb
 * @license MIT
 * 
 * taken from the armlet example
 * */

 /*
    get ast count - done
    autodetect interface implementations
    get all source lines referenced by statements
    calculate external calls in complexity
 */

const fs = require('fs');
const path = require('path');

const parser = require('solidity-parser-antlr');
const parserHelpers = require("./parserHelpers")
const crypto = require('crypto');
const sloc = require('sloc');

const TSHIRT_HR = Object.freeze({"SMALL":"Small", "MEDIUM":"Medium", "LARGE":"Large", "X_LARGE":"X-Large", "XX_LARGE":"XX-Large", "XXXXXX_LARGE":"XXX-Huge!"})
const TSHIRT = Object.freeze({"SMALL":1, "MEDIUM":2, "LARGE":3, "X_LARGE":4, "XX_LARGE":5, "XXXXXX_LARGE":6})

const tshirtSizes = {
    nsloc: function(val) {
        if(val <= 200) return TSHIRT.SMALL
        else if(val <= 1000) return TSHIRT.MEDIUM
        else if(val <= 2000) return TSHIRT.LARGE
        else if(val <= 4500) return TSHIRT.X_LARGE
        else if(val <= 10000) return TSHIRT.XX_LARGE
        else return TSHIRT.XXXXXX_LARGE
    },
    files: function(val){
        if(val <= 4) return TSHIRT.SMALL
        else if(val <= 20) return TSHIRT.MEDIUM
        else if(val <= 30) return TSHIRT.LARGE
        else if(val <= 60) return TSHIRT.X_LARGE
        else if(val <= 150) return TSHIRT.XX_LARGE
        else return TSHIRT.XXXXXX_LARGE
    },
    perceivedComplexity: function(val) {
        if(val <= 50) return TSHIRT.SMALL
        else if(val <= 100) return TSHIRT.MEDIUM
        else if(val <= 200) return TSHIRT.LARGE
        else if(val <= 400) return TSHIRT.X_LARGE
        else if(val <= 600) return TSHIRT.XX_LARGE
        else return TSHIRT.XXXXXX_LARGE
    },
    commentRatio: function(val) {
        if(val <= 0.2) return TSHIRT.XXXXXX_LARGE  // lessEq than 20% of source is comments
        else if(val <= 0.3) return TSHIRT.XX_LARGE
        else if(val <= 0.4) return TSHIRT.X_LARGE
        else if(val <= 0.5) return TSHIRT.LARGE
        else if(val <= 0.6) return TSHIRT.MEDIUM  // lessEq than 60% of source is comments
        else return TSHIRT.SMALL  // > 60% of source is comments; good 
    },
    experimentalFeatures: function(arr){
        if(!arr) return TSHIRT.SMALL
        else if(arr.length<=1) return TSHIRT.MEDIUM
        else if(arr.length<=2) return TSHIRT.LARGE
        return TSHIRT.SMALL
    },
    compilerVersion: function(arr){
        if(!arr) return TSHIRT.SMALL

        if(arr.some(x=>x.startsWith("0.4.") || x.startsWith("^0.4."))) return TSHIRT.MEDIUM  //todo: rely on semver? we dont detect <0.4 atm
        return TSHIRT.SMALL
    }
}

const scores = {
    IfStatement:1,
    ModifierInvocation:1,
    FunctionCall:1,
    "FunctionDefinition:Public":2,
    "FunctionDefinition:External":2,
    "FunctionDefinition:Payable":3,
    NewExpression:10,
    ForStatement:5,
    WhileStatement:1,
    DoWhileStatement:1,
    InlineAssemblyStatement:2,
    AssemblyIf:2,
    AssemblyFor:2,
    AssemblyCase:2,
    AssemblyCall:2,
    Conditional:1,
    SubAssembly:2,
    StateVariableDeclaration:1,
    "ContractDefinition:BaseContracts":2,
    ContractDefinition:1,

}

function capitalFirst(string) 
{
    if(!string.length) {
        return ""
    } else if(string.length==1){
        return string.toUpperCase()
    }
    return string.charAt(0).toUpperCase() + string.slice(1);
}

class SolidityMetricsContainer {
    
    constructor(name, args){
        this.name = name;

        this.basePath = args.basePath || "";
        this.inputFileGlobExclusions = args.inputFileGlobExclusions || "";
        this.inputFileGlob = args.inputFileGlob || "";
        this.inputFileGlobLimit = args.inputFileGlobLimit;

        this.seenFiles = new Array();
        this.seenDuplicates = new Array();
        this.seenHashes = new Array();
        this.metrics = new Array();
        this.errors = new Array();

        this.truffleProjectLocations = new Array();
        
    }

    addTruffleProjectLocation(truffleJsPath){
        this.truffleProjectLocations = Array.from(new Set([truffleJsPath, ...this.truffleProjectLocations]))
    }

    analyze(inputFileGlobs){

        return this.analyzeFile(inputFileGlobs);
    }

    analyzeFile(filepath){
        let content = fs.readFileSync(filepath).toString('utf-8')
        let hash = crypto.createHash('sha1').update(content).digest('base64');
        
        try {
            var metrics = new SolidityFileMetrics(filepath, content)

            this.seenFiles.push(filepath);
            if (this.seenHashes.indexOf(hash)>=0){
                //DUP
                this.seenDuplicates.push(filepath);
            } else {
                //NEW
                this.seenHashes.push(hash);
            }
            this.metrics.push(metrics)
        } catch (e) {
            console.error(e)
            this.errors.push(filepath)
            if (e instanceof parser.ParserError) {
                console.log(e.errors)
            }
            return;
        }
    }

    totals(){
        let total = {
            totals : new Metric(),
            avg: new Metric(),
            num: {
                sourceUnits: this.seenFiles.length,
                metrics: this.metrics.length,
                duplicates: this.seenDuplicates.length,
                errors: this.errors.length,
            } 
        };

        total.totals = total.totals.sumCreateNewMetric(...this.metrics)
        total.totals.sloc.commentToSourceRatio = total.totals.sloc.comment/total.totals.sloc.source
        total.avg = total.avg.sumAvgCreateNewMetric(...this.metrics)
        total.totals.nsloc.commentToSourceRatio = total.totals.nsloc.comment/total.totals.nsloc.source

        return total;
    }

    generateReportMarkdown(){

        let totals = this.totals();
        let mdreport_head = `
[<img width="200" alt="get in touch with Consensys Diligence" src="https://user-images.githubusercontent.com/2865694/56826101-91dcf380-685b-11e9-937c-af49c2510aa0.png">](https://diligence.consensys.net)<br/>
<sup>
[[  🌐  ](https://diligence.consensys.net)  [  📩  ](mailto:diligence@consensys.net)  [  🔥  ](https://consensys.github.io/diligence/)]
</sup><br/><br/>



# Solidity Metrics for ${this.name}

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi lobortis feugiat odio tempor suscipit. Suspendisse pretium aliquam nisl eget imperdiet. Praesent aliquet consequat semper. Aliquam massa nibh, blandit at ultricies sit amet, ornare cursus est. Phasellus suscipit, nisl vitae porttitor porttitor, mauris enim vulputate diam, venenatis suscipit velit mi a erat. 

## Scope

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi lobortis feugiat odio tempor suscipit. Suspendisse pretium aliquam nisl eget imperdiet. Praesent aliquet consequat semper. Aliquam massa nibh, blandit at ultricies sit amet, ornare cursus est. Phasellus suscipit, nisl vitae porttitor porttitor, mauris enim vulputate diam, venenatis suscipit velit mi a erat. 

This section lists files that are in scope for the metrics report. 

- **Project:** ${this.name}
- **Included Files:** \`${this.inputFileGlob}\`
- **Excluded Paths:** \`${this.inputFileGlobExclusions}\`
- **File Limit:** ${this.inputFileGlobLimit}

### Source Units in Scope

Source Units Analyzed: **${this.seenFiles.length}** 


* ${this.seenFiles.map(f => f.replace(this.basePath, "")).join("\n* ")}



#### Out of Scope - Duplicate Source Units

* ${this.seenDuplicates.length ? this.seenDuplicates.map(f => f.replace(this.basePath, "")).join("\n* ") : "None"}


## Report

### Overview

The analysis finished with **${this.errors.length}** errors and **${this.seenDuplicates.length}** duplicate files.

${this.errors.length ? "**Errors:**\n\n" + this.errors.join("\n* ") : ""}

${this.truffleProjectLocations.length ? "**Truffle Project Locations Observed:**\n* " + this.truffleProjectLocations.map(f => "./"+f.replace(this.basePath, "")).join("\n* ") : ""}

#### Risk

<div class="wrapper" style="max-width: 512px; margin: auto">
			<canvas id="chart-risk-summary"></canvas>
</div>

#### Source Lines (normalized vs. real)

<div class="wrapper" style="max-width: 512px; margin: auto">
    <canvas id="chart-nsloc-total"></canvas>
</div>

#### Inline Documentation

- **Comment-to-Source Ratio:** On average there are ${Math.round(totals.totals.sloc.source/totals.totals.sloc.comment *100)/100} Source-Code lines for every comment in the Code-Base (lower=better).
- **ToDo's:** ${totals.totals.sloc.todo}  

#### Components

- **Contracts:** ${totals.totals.num.contracts}  
- **Libraries:** ${totals.totals.num.libraries}  
- **Interfaces:** ${totals.totals.num.interfaces}  

#### Exposed Functions

This section lists functions that are explicitly declared public or payable. Please note that getter methods for public stateVars are not included.  

- **🌐Public:**  ${totals.totals.num.functionsPublic}  
- **💰Payable:** ${totals.totals.num.functionsPayable}  

#### StateVariables

- **Total:** ${totals.totals.num.stateVars}  
- **🌐Public:** ${totals.totals.num.stateVarsPublic}

#### Capabilities

- **Solidity Versions:** ${totals.totals.capabilities.solidityVersions.join(", ")}
- **Experimental Pragmas:** ${totals.totals.capabilities.experimental.join(", ")}
- **Can Receive Funds:** ${totals.totals.capabilities.canReceiveFunds ? "yes" : "no"}
- **Assembly:** ${totals.totals.capabilities.assembly ? "yes" : "no"} (Assembly Blocks: ${totals.totals.num.assemblyBlocks})

#### Inheritance Graph

- **Cyclomatic Complexity:** TBD
- **Other Graph Metrics:** TBD
- **Number of deployable (most derived) Contracts:** TBD

//SURYA FANCY GRAPH HERE

#### Call-Graph

- **Cyclomatic Complexity:** TBD
- **Other Graph Metrics:** TBD

//SURYA FANCY GRAPH HERE

#### Totals

<div class="wrapper" style="max-width: 512px; margin: auto">
    <canvas id="chart-num-bar"></canvas>
</div>

\`\`\`
    ${/* JSON.stringify(totals,null,2) */''}
\`\`\`

`; 

        let mdreport_tail = `
#### Source Units

\`\`\`
    ${JSON.stringify(this.metrics,null,2)}
\`\`\`
        `;

        return mdreport_head+mdreport_tail;
    }
}

class Metric {
    
    constructor() {
        this.ast = {}
        this.sloc = {}
        this.nsloc = {}
        this.complexity = {
            cyclomatic:undefined,
            perceivedNaiveScore:0
        }
        this.summary = {
            perceivedComplexity: undefined,
            size: undefined,
            numLogicContracts: undefined,
            humFiles: undefined,
            inheritance: undefined,
            callgraph: undefined,
            cyclomatic: undefined,
            interfaceRisk: undefined,
            inlineDocumentation: undefined,
            compilerFeatures: undefined,
            compilerVersion: undefined
        }
        this.num = {
            astStatements:0,
            contractDefinitions:0,
            contracts:0,
            libraries:0,
            interfaces:0,
            imports:0,
            functionsPublic:0,
            functionsPayable:0,
            assemblyBlocks:0,
            stateVars:0,
            stateVarsPublic:0
        }
        this.capabilities = {
            solidityVersions: new Array(),
            assembly: false,
            experimental: new Array(),
            canReceiveFunds: false
        }
    }
    

    update(){
        // calculate naiveScore (perceived complexity)
        Object.keys(this.ast).map(function(value, index){
            this.complexity.perceivedNaiveScore += this.ast[value] * (scores[value] || 0)
        },this)

        this.num.contractDefinitions = this.ast["ContractDefinition"] || 0
        this.num.contracts = this.ast["ContractDefinition:Contract"] || 0
        this.num.libraries = this.ast["ContractDefinition:Library"] || 0
        this.num.interfaces = this.ast["ContractDefinition:Interface"] || 0
        this.num.imports = this.ast["ImportDirective"] || 0
        this.num.functionsPublic = (this.ast["FunctionDefinition:Public"] || 0) + (this.ast["FunctionDefinition:External"] || 0)
        this.num.functionsPayable = this.ast["FunctionDefinition:Payable"] || 0
        this.num.assemblyBlocks = this.ast["InlineAssemblyStatement"] || 0
        this.num.stateVars = this.ast["StateVariableDeclaration"] || 0
        this.num.stateVarsPublic = this.ast["StateVariableDeclaration:Public"] || 0


        // generate human readable ratings
        this.summary.size = tshirtSizes.nsloc(this.nsloc.source)
        this.summary.perceivedComplexity = tshirtSizes.perceivedComplexity(this.complexity.perceivedNaiveScore)
        this.summary.numLogicContracts = tshirtSizes.files(this.num.contracts+this.num.libraries)
        this.summary.interfaceRisk = tshirtSizes.files(this.num.functionsPublic+this.num.functionsPayable)
        this.summary.inlineDocumentation = tshirtSizes.commentRatio(this.nsloc.commentToSourceRatio)
        this.summary.compilerFeatures = tshirtSizes.experimentalFeatures(this.capabilities.experimental)
        this.summary.compilerVersion = tshirtSizes.compilerVersion(this.capabilities.solidityVersions)
        if(this.ast["SourceUnit"]>1) this.summary.numFiles = tshirtSizes.files(this.ast["SourceUnit"])

        //postprocess the ast
        this.capabilities.assembly = Object.keys(this.ast).some(function(k){ return ~k.toLowerCase().indexOf("assembly") })
        this.capabilities.canReceiveFunds = !!this.ast["FunctionDefinition:Payable"]

    }

    sumCreateNewMetric(...solidityFileMetrics){
        let result = new Metric()

        solidityFileMetrics.forEach(a => {  //arguments
            Object.keys(result).forEach(attrib => {  // metric attribs -> object
                Object.keys(a.metrics[attrib]).map(function(key, index) { // argument.keys		
                    if(typeof a.metrics[attrib][key]==="number")  // ADD
                        result[attrib][key] = (result[attrib][key] || 0) + a.metrics[attrib][key];
                    else if(typeof a.metrics[attrib][key]==="boolean")  // OR
                        result[attrib][key] = result[attrib][key] || a.metrics[attrib][key];
                    else if(Array.isArray(a.metrics[attrib][key]))  // concat arrays -> maybe switch to sets 
                        result[attrib][key] = Array.from(new Set([...result[attrib][key], ...a.metrics[attrib][key]]))
                });
            })
        })

        result.update()
        return result
    }

    sumAvgCreateNewMetric(...solidityFileMetrics){
        let result = this.sumCreateNewMetric(...solidityFileMetrics)

        Object.keys(result).forEach(attrib => {  // metric attribs -> object
            Object.keys(result[attrib]).map(function(key, index) { // argument.keys		
                if(typeof result[attrib][key]==="number")  // ADD
                    result[attrib][key] /= solidityFileMetrics.length;
                else
                    delete result[attrib][key]  //not used
            });
        })

        result.update()
        return result
    }

}

class SolidityFileMetrics {

    constructor(filepath, content){
        
        this.filename = filepath;
        this.metrics = new Metric()
        // analyze
        this.analyze(content);

        // get sloc
        this.metrics.sloc = sloc(content, "js");
        this.metrics.sloc.commentToSourceRatio = this.metrics.sloc.comment/this.metrics.sloc.source

        // get normalized sloc (function heads normalized)
        const normalized = content.replace(/function\s*\S+\s*\([^{]*/g, 'function ', content);
        this.metrics.nsloc = sloc(normalized, "js");
        this.metrics.nsloc.commentToSourceRatio = this.metrics.nsloc.comment/this.metrics.nsloc.source

        this.metrics.update()
    }

    analyze(content){
        let that = this;
        let ast = this.parse(content)

        let countAll= new Proxy({
                PragmaDirective(node){
                    let pragmaString = node.name + ":" + node.value.replace(" ","_");
                    that.metrics.ast["Pragma:"+pragmaString] = ++that.metrics.ast["Pragma:"+pragmaString] || 1;
                    if(node.name.toLowerCase().indexOf("experimental")>=0){
                        that.metrics.capabilities.experimental.push(node.value)
                    } else if(node.name.toLowerCase().indexOf("solidity")>=0){
                        that.metrics.capabilities.solidityVersions.push(node.value);
                    }
                },
                ContractDefinition(node) {
                    that.metrics.ast["ContractDefinition:"+capitalFirst(node.kind)] = ++that.metrics.ast["ContractDefinition:"+capitalFirst(node.kind)] || 1;
                    that.metrics.ast["ContractDefinition:BaseContracts"] = that.metrics.ast["ContractDefinition:BaseContracts"] + node.baseContracts.length || node.baseContracts.length;
                },
                FunctionDefinition(node){
                    let stateMutability = node.stateMutability || "internal"; //set default
                    that.metrics.ast["FunctionDefinition:"+capitalFirst(stateMutability)] = ++that.metrics.ast["FunctionDefinition:"+capitalFirst(stateMutability)]|| 1;
                    that.metrics.ast["FunctionDefinition:"+capitalFirst(node.visibility)] = ++that.metrics.ast["FunctionDefinition:"+capitalFirst(node.visibility)] || 1;
                },
                StateVariableDeclaration(node){
                    //NOP - this already counts the VariableDeclaration subelements.

                },
                VariableDeclaration(node){
                    let typeName = "VariableDeclaration"
                    if(node.isStateVar){
                        typeName = "StateVariableDeclaration"
                        that.metrics.ast[typeName+":"+capitalFirst(node.visibility)] = ++that.metrics.ast[typeName+":"+capitalFirst(node.visibility)]|| 1;
                    }

                    if(node.storageLocation){
                        that.metrics.ast[typeName+":"+capitalFirst(node.storageLocation)] = ++that.metrics.ast[typeName+":"+capitalFirst(node.storageLocation)]|| 1;
                    }
                    
                    if(node.isDeclaredConst)
                        that.metrics.ast[typeName+":Const"] = ++that.metrics.ast[typeName+":Const"]|| 1;
                    if(node.isIndexed)
                        that.metrics.ast[typeName+":Indexed"] = ++that.metrics.ast[typeName+":Indexed"]|| 1;
                },
                UserDefinedTypeName(node){
                    that.metrics.ast["UserDefinedTypeName:"+capitalFirst(node.namePath)] = ++that.metrics.ast["UserDefinedTypeName:"+capitalFirst(node.namePath)]|| 1;
                },
                FunctionCall(node){
                    let funcCallType = parserHelpers.isRegularFunctionCall(node) ? "Regular": null;
                    if (!funcCallType && parserHelpers.isMemberAccess(node)){
                        funcCallType =  parserHelpers.isMemberAccessOfAddress(node) ? "Address" : parserHelpers.isAContractTypecast(node) ? "ContractTypecast" : "MemberAccess";
                    }
                    if(funcCallType)
                        that.metrics.ast["FunctionCall:"+funcCallType] = ++that.metrics.ast["FunctionCall:"+funcCallType] || 1;
                    
                }
            },{
                get(target, name) {
                    if(name.endsWith(":exit")) return;  //skip func-exits
                    that.metrics.ast[name] = ++that.metrics.ast[name] || 1;
                    that.metrics.num.astStatements += 1
                    return target[name]
                }       
        })
        parser.visit(ast, countAll);
    }

    parse(content){
        var ast = parser.parse(content, {loc:false, tolerant:true})
        return ast;
    }
}

module.exports = {
    SolidityMetricsContainer
}

