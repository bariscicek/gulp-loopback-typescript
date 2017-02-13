"use strict";
var through = require("through2");
exports.typescriptPlugin = function (options) {
    var stream = through.obj(function (file, enc, callback) {
        console.log(file);
        callback();
    });
    return stream;
};
//# sourceMappingURL=index.js.map