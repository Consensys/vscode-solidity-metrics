const path = require("path");
const fs = require("fs");


class ReportGenerator {
  constructor(context, content_folder) {
    this.context = context
    this.timeout = null;
    this.content_folder = content_folder;
  }

  async getPreviewTemplate(context, templateName) {
    // // let previewPath = context.asAbsolutePath(path.join(this.content_folder, templateName));
    let previewPath = path.join(path.resolve('content'), templateName);
    // console.log(previewPath)

    return new Promise((resolve, reject) => {
      fs.readFile(previewPath, "utf8", function (err, data) {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  async getPreviewHtml(reportHtml , data) {
    let templateHtml = await this.getPreviewTemplate(this.context, "index.html");

    templateHtml = templateHtml.replace(/<script .*?src="(.+)">/g, (scriptTag, srcPath) => {
      let resource = path.join(path.resolve("${__dirname}/.."), this.content_folder, srcPath)
      return `<script src="${resource}">`;
    })
    templateHtml = templateHtml.replace("MetricsDataJSON", JSON.stringify(data))
    templateHtml = templateHtml.replace("HTMLREPORTHERE", reportHtml)

    return templateHtml;
  }
}

module.exports = { ReportGenerator }