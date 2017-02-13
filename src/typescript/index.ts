import * as through from "through2";
import * as gutil from "gulp-util";

interface IOptions {
  /**
   * destination directory for final definition files to be deployed.
   * @type {string}
   */
  dest?: string;
}

export const typescriptPlugin = (options: IOptions) => {

  const stream = through2.obj((file, enc, callback) => {
    console.log(file);

    callback();
  });

  return stream;
};