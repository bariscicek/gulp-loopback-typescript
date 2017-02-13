declare var module: any;

import * as through from "through2";
import * as gutil from "gulp-util";
import * as ejs from "ejs";
import * as _ from "lodash";
import * as path from "path";
import * as pluralize from "pluralize";
import { readdirSync, readFileSync, writeFileSync } from "fs";

let models = [];

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
};

interface IParams { 
  [s: string]: any;
};

interface ISchema {
  template: string;

  output: string;

  params: IParams;
};


const typescriptPlugin = (options: IOptions) => {

  if (!options.dest) {
    options.dest = path.join(__dirname, "..", "@types", "loopback");
  }


  if (!options.modelDir) {
    options.modelDir = path.join(__dirname, "..", "..", "src", "typescript", "common", "models");
  }

  models = _.map(_.filter(readdirSync(options.modelDir), (dir) => { return dir.indexOf(".json") !== -1; }), modelFile => {
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

  _.each(_.clone(models), model => {
    models[model.name] = model;
  });

  let schema: ISchema[] = [
    /**
     * SDK INDEXES
     */
    {
      template: path.join(__dirname, "./src/esj/index.ejs"),
      output: options.dest + "/models/index.ts",
      params: {
        models: models
      }
    }
  ];

  const stream = through.obj((file, enc, callback) => {
    let model: any = {};
    let modelName = null;

    try {
      model = JSON.parse(file.toString("utf-8"));
      modelName = model.name;
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
        output: options.dest + "/models/" + modelName + ".ts",
        params: {
          model: model,
          modelName: modelName,
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
      console.info("Generating: %s", `${config.output}`);
      writeFileSync(
        `${config.output}`,
        ejs.render(readFileSync(
          require.resolve(config.template),
          { encoding: "utf-8" }),
          config.params
        )
      )
    }
  );

    callback();
  });

  return stream;
};

/**
 * @author João Ribeiro <jonnybgod@gmail.com, http://jonnybgod.ghost.io>,
 * @license MIT
 * @method buildPropertyType
 * @description
 * Define which properties should be passed as route params
 */
function buildPropertyType(type) {
  switch (typeof type) {
    case "function":
      switch(type.name) {
        case "String":
        case "Number":
        case "Boolean":
          return type.name.toLowerCase();
        case "Date":
        case "GeoPoint":
          return type.name;
        default:
          return "any";
      }
    case "object":
      if(Array.isArray(type)) {
          return `Array<${buildPropertyType(type[0])}>`
      }
      return "object";
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
function buildPropertyDefaultValue(property) {
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
  let relation = model.sharedClass.ctor.relations[relationName];
  let targetClass = relation.targetClass;
  let basicType = (models[targetClass]) ? targetClass : "any";
  let finalType = relation.type.match(/(hasOne|belongsTo)/g)
    ? basicType : `${basicType}[]`;
  return finalType;
}

function getModelRelations(model) {
  return Object.keys(model.sharedClass.ctor.relations).filter(relationName =>
      model.sharedClass.ctor.relations[relationName].targetClass &&
      model.sharedClass.ctor.relations[relationName].targetClass !== model.name
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
  if (relations.length > 0) {
    relations.forEach((relationName, i) => {
      let targetClass = model.sharedClass.ctor.relations[relationName].targetClass;
      if (!loaded[targetClass]) {
        loaded[targetClass] = true;
        output.push(`  ${targetClass}`);
      }
    });
  }
  // Add GeoPoint custom type import
  Object.keys(model.properties).forEach((property) => {
    var geoPointType = buildPropertyType(model.properties[property].type);
    var hasGeoPointType = geoPointType.indexOf("GeoPoint") !== -1;
    if(hasGeoPointType) {
        output.push("  GeoPoint");
    }
  });
  if(output.length > 0) {
      var imports = output.join(",\n");
      output = [
        "import {",
        imports,
        "} from \"../index\";\n"
      ];
  }
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
    output.push(`  ${property}${isOptional}: ${buildPropertyType(meta.type)}${defaultValue};`);
  });
  // Add Model Relations
  Object.keys(model.sharedClass.ctor.relations).forEach(relation => {
    let relationType = buildRelationType( model, relation );
    // let defaultTypeValue = !isInterface && ctx.defaultValue === "enabled" && relationType.indexOf("Array") >= 0 ? " = []" : ";
    let defaultTypeValue = "";
    // defaultTypeValue = !isInterface && ctx.defaultValue === "enabled" && relationType.indexOf("Array") === -1 ? " = null" : defaultTypeValue;
    output.push( `  ${relation}${isInterface ? "?" : ""}: ${relationType}${defaultTypeValue};` );
  });
  return output.join("\n");
}

export default typescriptPlugin;

module.exports = typescriptPlugin;
module.exports.default = typescriptPlugin;