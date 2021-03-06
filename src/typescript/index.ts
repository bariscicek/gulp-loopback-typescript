declare var module: any;

import * as through from "through2";
import * as gutil from "gulp-util";
import * as _ from "lodash";
import * as mkdirp from "mkdirp";
import * as path from "path";
import * as pluralize from "pluralize";
import { readdirSync, readFileSync, writeFileSync } from "fs";

const ejs = require("ejs");

let models = {};
let interfaces = {};
ejs.filters.q = (obj) => JSON.stringify(obj, null, 2);

interface IOptions {
  /**
   * destination directory for final definition files to be deployed.
   * @type {string}
   */
  dest?: string;
  /**
   * model directory relative to the root
   */
  modelDir?: string;
}

interface IParams {
  [s: string]: any;
}

interface ISchema {
  template: string;

  output: string;

  params: IParams;
}

const indent = (str: string, indent: number, space: boolean = false, tabstop = 2) => {
  const pad = _.map(_.range(0, space ? indent * tabstop : indent), seq => space ? " " : "\t").join("");

  return pad + str.replace(/\n/g, "\n" + pad);
};

const typescriptPlugin = (options: IOptions) => {

  if (!options.dest) {
    options.dest = path.join(__dirname, "..", "@types", "loopback");
  }


  if (!options.modelDir) {
    options.modelDir = path.join(__dirname,  "..", "src", "typescript", "common", "models");
  }

  let loopBackDefitionContent = '';

  try {
    loopBackDefitionContent = readFileSync(path.join(options.dest, "index.d.ts")).toString("utf-8");

  } catch (e) {
    loopBackDefitionContent = readFileSync(path.join(__dirname, "index.d.ts")).toString("utf-8");
    mkdirp.sync(options.dest);

    console.warn(`Could not read definitions file for loopback. Plugin copy will be used.`);
  }

  let _models = _.map(_.filter(readdirSync(options.modelDir), (dir) => { return dir.indexOf(".json") !== -1; }), modelFile => {
    let modelFileContent = readFileSync(path.join(options.modelDir, modelFile));
    let modelFileContentObject = {
      name: null
    };
    try {
      modelFileContentObject = JSON.parse(modelFileContent.toString("utf-8"));
      return modelFileContentObject;
    } catch (e) {
      console.warn(`Could not read the model file for ${modelFile}`);
      return null;
    }
  }); // map

  _.each(_.values(_models), model => {
    models[model.name] = model;
  });


  let output = '';

  const stream = through.obj((file, enc, callback) => {
    let model: any = {};
    let modelName = null;
    let modelBaseName = "Model";
    let schema: ISchema[] = [];

    // clean up to prevent repeated decleration
    interfaces = {};

    try {
      model = JSON.parse(file._contents.toString("utf-8"));
      if (!model.relations) {
        model.relations = {};
      } else {
        _.mapKeys(model.relations, (value: any, key) => {
          model.relations[key].targetClass = value.model;
        });
      }
      modelName = model.name;
      modelBaseName = model.base || "Model";
    } catch (e) {
      return callback(new Error("Could not parse the model file"));
    }

    /**
     * SDK DYNAMIC FILES
     */
    schema.push(
      /**
      * SDK MODELS
      */
      {
        template: path.join(__dirname, "./src/ejs/model.ejs"),
        output: options.dest + "/models/" + modelName + ".d.ts",
        params: {
          model: model,
          modelName: modelName,
          modelBaseName: modelBaseName,
          plural: pluralize.plural(modelName),
          buildPropertyType: buildPropertyType,
          buildPropertyDefaultValue: buildPropertyDefaultValue,
          buildRelationType: buildRelationType,
          buildModelImports,
          buildModelProperties
        }
      }
    ); // push

    schema.forEach(
      config => {
        console.info("Processing: %s", `${config.output}`);
        output += ejs.render(readFileSync(
            require.resolve(config.template),
            { encoding: "utf-8" }),
            config.params
          );
      }
    );

    if (/\/\* gulp-loopback-typescript: definitions end \*\//.exec(loopBackDefitionContent)) {
      console.log('definitions are being updated');
      loopBackDefitionContent = loopBackDefitionContent.replace(/declare namespace l {[\s\S]*\/\* gulp-loopback-typescript: definitions end \*\//, "declare namespace l {\n" + indent("/* gulp-loopback-typescript: definitions start */\n" + output + "\n/* gulp-loopback-typescript: definitions end */", 3, true));
    } else {
      console.log('definitions are created');
      loopBackDefitionContent = loopBackDefitionContent.replace(new RegExp("declare namespace l {", ""), "declare namespace l {\n" + indent("/* gulp-loopback-typescript: definitions start */\n" + output + "\n/* gulp-loopback-typescript: definitions end */", 3, true));
    }

    writeFileSync(path.join(options.dest, "index.d.ts"), loopBackDefitionContent);
    callback();
  });

  return stream;
};

/**
 * @author João Ribeiro <jonnybgod@gmail.com, http://jonnybgod.ghost.io>,
 * @author Baris Cicek <barisc@yandex.com>
 * @license MIT
 * @method buildPropertyType
 * @description
 * Define which properties should be passed as route params
 */
function buildPropertyType(type, propName = null, prop = null) {
  if (!type && prop) {
    if (Array.isArray(prop)) {
      if (prop[0].type) {
        return `Array<${buildPropertyType(prop[0].type)}>`
      }

      // no type means it is interface
      return `Array<I${_.capitalize(propName)}>`;

    } else if (typeof prop == "object") {
      if (prop.type) {
        type = prop.type;
      } else {
        return `I${_.capitalize(propName)}`;
      }
    } else if (typeof prop === "string") { // handle property: "Sring" definitions
      type = prop;
    }
  } else if (!type) {
    return "any";
  }

  // strip the quotes if any
  if (typeof type == 'string') {
    type = type.replace(/\"\'\s/g, "");
  }

  if (typeof type == 'object') {
    if (Array.isArray(type)) {
      return `Array<${buildPropertyType(type[0])}>`
    }

    return "Object";
  }

  switch (type) {
    case "String":
    case "Number":
    case "Boolean":
      return type.toLowerCase();
    case "Date":
    case "GeoPoint":
      return type;

    default:
      return "any";
  }
}

/*
 * @author Julien Ledun <j.ledun@iosystems.fr>,
 * @license MIT
 * @method buildPropertyDefaultValue
 * @description
 * Define defaults null values for class properties
 */
function buildPropertyDefaultValue(property): any {
  let defaultValue = ( property.hasOwnProperty("default") ) ? property.default : "";
  switch (typeof property.type) {
    case "function":
      switch(property.type.name) {
        case "String":
          return `"${defaultValue}"`;
        case "Number":
          return isNaN( Number(defaultValue) ) ? 0 : Number( defaultValue );
        case "Boolean":
          return Boolean( defaultValue );
        case "Date":
          return isNaN( Date.parse( defaultValue ) ) ? `new Date(0)` : `new Date("${defaultValue}")`;
        case "GeoPoint":
        default:
          return "<any>null";
    }
    case "object":
      if(Array.isArray(property.type)) {
        return "<any>[]";
      }
      return "<any>null";
    default:
      return "<any>null";
  }
}

/**
 * @method buildRelationType
 * @description
 * Discovers property type according related models that are public
 */
function buildRelationType(model, relationName) {
  let relation = model.relations[relationName];
  let targetClass = relation.targetClass;
  // basic type should be an interface of the targetClass
  let basicType = (models[targetClass]) ? `${targetClass}` : "any";
  let finalType = relation.type.match(/(hasMany|hasOne|belongsTo)/g)
    ? basicType : `${basicType}[]`;
  return finalType;
}

function getModelRelations(model) {
  return Object.keys(model.relations).filter(relationName =>
      model.relations[relationName].targetClass &&
      model.relations[relationName].targetClass !== model.name
  );
}

/**
 * @method buildModelImports
 * @description
 * Define import statement for those model who are related to other scopes
 */
function buildModelImports(model) {
  let relations = getModelRelations(model);
  let loaded = {};
  let output = [];
  // if (relations.length > 0) {
  //   relations.forEach((relationName, i) => {
  //     let targetClass = model.relations[relationName].targetClass;
  //     if (!loaded[targetClass]) {
  //       loaded[targetClass] = true;
  //       output.push(`  I${targetClass}`);
  //     }
  //   });
  // }
  // Add GeoPoint custom type import
  // Object.keys(model.properties).forEach((property) => {
  //   var geoPointType = buildPropertyType(model.properties[property].type, property, model.properties);
  //   var hasGeoPointType = geoPointType.indexOf("GeoPoint") !== -1;
  //   if(hasGeoPointType) {
  //       output.push("  GeoPoint");
  //   }
  // });
  // if(output.length > 0) {
  //     var imports = output.join(",\n");
  //     output = [
  //       "import {",
  //       imports,
  //       "} from \"../index\";\n"
  //     ];
  // }

  // build sub interfaces

  Object.keys(model.properties).forEach((propertyName) => {
    let property = model.properties[propertyName];
    if (!property.type) {
      let subModel: any = {
        properties: property,
        relations: {}
      };

      // get rid of array
      if (Array.isArray(property)) {
        subModel.properties = _.reduce(property, (m, c) => { return _.extend(m, c); });
      }

      _.each(_.keys(subModel.properties), (key) => {
        if (typeof subModel.properties[key] === 'object') {
          if (!subModel.properties[key].type && !interfaces['I' + _.capitalize(key)]) {
            let subModel: any = {
              properties: property,
              relations: {}
            };
            output.concat(buildModelImports(subModel));
          }
        }
      });
      interfaces['I' + _.capitalize(propertyName)] = buildModelProperties(subModel, true);
    }
  });

  _.each(_.keys(interfaces), (iface) => {
    output.push(`interface ${iface} { \n${interfaces[iface]} \n}\n`);
  });
  return output.join("\n");
}

/**
 * @method buildModelProperties
 * @description
 * Define properties for the given model
 */
function buildModelProperties(model, isInterface) {
  let output = [];
  // Add Model Properties
  Object.keys(model.properties).forEach((property) => {
    if (model.isUser && property === "credentials") return;
    let meta = model.properties[property];
    let isOptional = isInterface && !meta.required ? "?" : "";
    let defaultValue = !isInterface ? ` = ${buildPropertyDefaultValue(meta)}` : "";
    // defaultValue = ctx.defaultValue !== "enabled" && ctx.defaultValue !== "strict" ? " : defaultValue;
    // defaultValue = ctx.defaultValue === "strict" && !meta.hasOwnProperty("default") ? " : defaultValue;
    output.push(`  /**`);
    if (model.properties[property].description) {
      if (Array.isArray(model.properties[property].description)) {
        _.each(model.properties[property].description, desc => {
          output.push(`   * ${desc}`);
        });
      } else {
        output.push(`   * ${model.properties[property].description}`);
      }
    }
    output.push(`   * @param ${buildPropertyType(meta.type, property, model.properties[property])}`);
    output.push(`   */`);
    output.push(`  ${property}${isOptional}: ${buildPropertyType(meta.type, property, model.properties[property])}${defaultValue};`);
  });
  // Add Model Relations
  Object.keys(model.relations).forEach(relation => {
    let relationType = buildRelationType( model, relation );
    // let defaultTypeValue = !isInterface && ctx.defaultValue === "enabled" && relationType.indexOf("Array") >= 0 ? " = []" : ";
    let defaultTypeValue = "";
    // defaultTypeValue = !isInterface && ctx.defaultValue === "enabled" && relationType.indexOf("Array") === -1 ? " = null" : defaultTypeValue;
    output.push(`  /**`);
    output.push(`   * ${model.relations[relation].type} relation for ${model.name}`);
    output.push(`   * @param ${relationType}`);
    output.push(`   */`);
    output.push( `  ${relation}${isInterface ? "?" : ""}: ${relationType}${defaultTypeValue};` );
  });
  return output.join("\n");
}

export default typescriptPlugin;

module.exports = typescriptPlugin;
module.exports.default = typescriptPlugin;