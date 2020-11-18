
function getRisks(inputJson){
    console.log(inputJson);
    let avgSummary = inputJson.avg.summary;
    let totalSummary = inputJson.totals.summary;

    let datasets = {
        avg:[],
        totals:[],
        keys:Array.from(new Set([...Object.keys(avgSummary), ...Object.keys(totalSummary)]))
    };


    datasets.keys.forEach(key => {
        datasets.avg.push(avgSummary[key] || 0);
        datasets.totals.push(totalSummary[key] || 0);
    });

    return datasets;
}

function getSloc(inputJson){
    let datasets = {
        sloc:[],
        nsloc:[],
        keys: Object.keys(inputJson.totals.nsloc).filter(x => x!=="total" && x!=="commentToSourceRatio")
    };
    datasets.keys.forEach(key => {
        datasets.sloc.push(inputJson.totals.sloc[key] || 0);
        datasets.nsloc.push(inputJson.totals.nsloc[key] || 0);
    });
    return datasets;
}

function getNum(inputJson){
    let datasets = {
        totals:[],
        avg:[],
        keys: Object.keys(inputJson.totals.num)
    };
    datasets.keys.forEach(key => {
        datasets.totals.push(inputJson.totals.num[key] || 0);
        datasets.avg.push(inputJson.avg.num[key] || 0);
    });
    return datasets;
}

function getNumAst(inputJson, filterKey, hideZeroValue){
    let datasets = {
        totals:[],
        avg:[],
        keys: Object.keys(inputJson.totals.ast).filter(k => filterKey===undefined ? true : filterKey(k))
    };
    datasets.keys.forEach(key => {
        if(hideZeroValue && inputJson.totals.ast[key]){
            datasets.totals.push(inputJson.totals.ast[key] || 0);
            datasets.avg.push(inputJson.avg.ast[key] || 0);
        } else {
            datasets.totals.push(inputJson.totals.ast[key] || 0);
            datasets.avg.push(inputJson.avg.ast[key] || 0);
        }
    });
    return datasets;
}


function renderReport(args){
    var sd = new showdown.Converter({extensions: ['table']});

    let preview = document.getElementById('preview');
    preview.innerHTML = sd.makeHtml(args.markdownTemplate);
    renderCharts(args.jsonData, window.chartColors);

    Object.entries(args.dotGraphs).forEach(entry => {
        let graphname = entry[0];
        let dotsrc = entry[1];
        //use key and value here
        renderGraphviz(dotsrc, graphname)
        });
}

function renderCharts(inputDataJson, presets){
    var presets = window.chartColors;

    let risks = getRisks(inputDataJson);

    var chart = new Chart('chart-risk-summary', {
        type: 'radar',
        data: {
            labels: risks.keys,
            datasets: [{
                data: risks.totals,
                label: 'overall',
                fill: 0
            }, {
                data: risks.avg,
                hidden: false,
                label: 'average',
                fill: 0
            }]
        },
        options: {
            maintainAspectRatio: true,
            spanGaps: false,
            scale: {
                ticks: {
                    beginAtZero: true,
                    max: 7
                }
            },
            elements: {
                line: {
                    tension: 0.000001
                }
            },
            plugins: {
                filler: {
                    propagate: false
                },
                'samples-filler-analyser': {
                    target: 'chart-analyser'
                },
                colorschemes: {
                    scheme: 'tableau.Tableau20'
                }
            }
        }
    });
    
    let sloc = getSloc(inputDataJson);
    var myDoughnutChart = new Chart('chart-nsloc-total', {
        type: 'pie',
        data: {
            labels: sloc.keys,
            datasets: [{
                label:"sloc",
                data: sloc.sloc
            },{
                label:"normalized sloc",
                data: sloc.nsloc
            }],
        },
        options: {
            plugins: {
                colorschemes: {
                    scheme: 'tableau.Tableau20'
                }
            }
        }
    });

    var numData = getNum(inputDataJson);
    var myBarChart = new Chart('chart-num-bar', {
            type: 'bar',
            data: {
            labels: numData.keys,
                datasets: [{
                    label:"total",
                    data: numData.totals
                },{
                    label:"average",
                    data: numData.avg,
                    hidden: true
                }],
            },
            options: {
                responsive: true,
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Summary'
                },
                scales: {
                    yAxes: [{
                        type: 'logarithmic',
                        ticks: {
                            suggestedMin: 0,    // minimum will be 0, unless there is a lower value.
                            beginAtZero: true,
                            min: 0
                        }
                    }]
                },
            }
        });
        var numDataAst = getNumAst(
            inputDataJson, 
            function(k) { return !k.startsWith("FunctionCall:Name:") && !k.startsWith("AssemblyCall:Name:")},
            true);
        var myBarChartAst = new Chart('chart-num-bar-ast', {
            type: 'bar',
            data: {
            labels: numDataAst.keys,
                datasets: [{
                    label:"total",
                    data: numDataAst.totals
                },{
                    label:"average",
                    data: numDataAst.avg,
                    hidden: true
                }],
            },
            options: {
                responsive: true,
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'AST Elements'
                },
                scales: {
                    yAxes: [{
                        type: 'logarithmic',
                        ticks: {
                            suggestedMin: 0,    // minimum will be 0, unless there is a lower value.
                            beginAtZero: true,
                            min: 0 
                        }
                    }]
                },
            }
        });

        //filtered data
        var numDataAstFC = getNumAst(
            inputDataJson, 
            function(key){return key.startsWith("FunctionCall:Name:")},
            true);
        var myBarChartAstFuncCall = new Chart('chart-num-bar-ast-funccalls', {
            type: 'bar',
            data: {
            labels: numDataAstFC.keys,
                datasets: [{
                    label:"total",
                    data: numDataAstFC.totals
                }],
            },
            options: {
                responsive: true,
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Function Calls'
                },
                scales: {
                    yAxes: [{
                        type: 'logarithmic',
                        ticks: {
                            suggestedMin: 0,    // minimum will be 0, unless there is a lower value.
                            beginAtZero: true,
                            min: 0 
                        }
                    }]
                },
            }
        });

        var numDataAstAC = getNumAst(
            inputDataJson, 
            function(key){return key.startsWith("AssemblyCall:Name:")},
            true);
        var myBarChartAstFuncCall = new Chart('chart-num-bar-ast-asmcalls', {
            type: 'bar',
            data: {
            labels: numDataAstAC.keys,
                datasets: [{
                    label:"total",
                    data: numDataAstAC.totals
                }],
            },
            options: {
                responsive: true,
                legend: {
                    position: 'top',
                },
                title: {
                    display: true,
                    text: 'Assembly Calls'
                },
                scales: {
                    yAxes: [{
                        type: 'logarithmic',
                        ticks: {
                            suggestedMin: 0,    // minimum will be 0, unless there is a lower value.
                            beginAtZero: true, 
                            min: 0  
                        }
                    }]
                },
            }
        });
    }
    

function renderGraphviz(dotSrc, targetId) {
    var graphviz = d3.select(targetId).graphviz();

    let transition = d3.transition("startTransition")
        .ease(d3.easeLinear)
        .delay(0)
        .duration(0);

    graphviz
        .fade(true)
        .transition(transition)
        .zoomScaleExtent([0,Infinity])
        .zoom(true) //disable=
        .renderDot(dotSrc);


    let nodes = d3.selectAll('.node,.edge,.cluster');
}

window.addEventListener('message', event => {
    const message = event.data;
    console.log(message);
    switch (message.command) {
        case 'renderReport':
            renderReport(message.value);
            break;
        }
    }, false);
