function getRisks(inputJson){
    console.log(inputJson);
    let avgSummary = inputJson.avg.summary;
    let totalSummary = inputJson.totals.summary;

    let datasets = {
        avg:new Array(),
        totals:new Array(),
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
        sloc:new Array(),
        nsloc:new Array(),
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
        totals:new Array(),
        avg:new Array(),
        keys: Object.keys(inputJson.totals.num)
    };
    datasets.keys.forEach(key => {
        datasets.totals.push(inputJson.totals.num[key] || 0);
        datasets.avg.push(inputJson.avg.num[key] || 0);
    });
    return datasets;
}

function getNumAst(inputJson){
    let datasets = {
        totals:new Array(),
        avg:new Array(),
        keys: Object.keys(inputJson.totals.ast)
    };
    datasets.keys.forEach(key => {
        datasets.totals.push(inputJson.totals.ast[key] || 0);
        datasets.avg.push(inputJson.avg.ast[key] || 0);
    });
    return datasets;
}