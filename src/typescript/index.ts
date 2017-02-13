declare var module: any;

import * as through from "through2";
import * as gutil from "gulp-util";

interface IOptions {
  /**
   * destination directory for final definition files to be deployed.
   * @type {string}
   */
  dest?: string;
}

const typescriptPlugin = (options: IOptions) => {

  const stream = through.obj((file, enc, callback) => {
    console.log(file);

    callback();
  });

  return stream;
};

export default typescriptPlugin;

module.exports = typescriptPlugin;
module.exports.default = typescriptPlugin;