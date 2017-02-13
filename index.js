"use strict";
var through = require("through2");
var typescriptPlugin = function (options) {
    var stream = through.obj(function (file, enc, callback) {
        console.log(file);
        callback();
    });
    return stream;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = typescriptPlugin;
module.exports = typescriptPlugin;
module.exports.default = typescriptPlugin;
//# sourceMappingURL=index.js.map