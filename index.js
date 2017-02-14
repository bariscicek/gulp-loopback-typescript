"use strict";
const through = require("through2");
const _ = require("lodash");
const mkdirp = require("mkdirp");
const rimraf = require("rimraf");
const path = require("path");
const pluralize = require("pluralize");
const fs_1 = require("fs");
const ejs = require("ejs");
let models = {};
ejs.filters.q = (obj) => JSON.stringify(obj, null, 2);
;
;
;
const typescriptPlugin = (options) => {
    if (!options.dest) {
        options.dest = path.join(__dirname, "..", "@types", "loopback");
    }
    if (!options.modelDir) {
        options.modelDir = path.join(__dirname, "..", "src", "typescript", "common", "models");
    }
    let _models = _.map(_.filter(fs_1.readdirSync(options.modelDir), (dir) => { return dir.indexOf(".json") !== -1; }), modelFile => {
        let modelFileContent = fs_1.readFileSync(path.join(options.modelDir, modelFile));
        let modelFileContentObject = {
            name: null
        };
        try {
            modelFileContentObject = JSON.parse(modelFileContent.toString("utf-8"));
            return modelFileContentObject;
        }
        catch (e) {
            console.warn(`Could not read the model file for ${modelFile}`);
            return null;
        }
    }); // map
    _.each(_.values(_models), model => {
        models[model.name] = model;
    });
    let schema = [
        /**
         * SDK INDEXES
         */
        {
            template: path.join(__dirname, "./src/ejs/index.ejs"),
            output: options.dest + "/models/index.d.ts",
            params: {
                models: models
            }
        }
    ];
    rimraf.sync(options.dest + "/models");
    mkdirp.sync(options.dest + "/models");
    const stream = through.obj((file, enc, callback) => {
        let model = {};
        let modelName = null;
        let modelBaseName = "Model";
        try {
            model = JSON.parse(file._contents.toString("utf-8"));
            if (!model.relations) {
                model.relations = {};
            }
            else {
                _.mapKeys(model.relations, (value, key) => {
                    model.relations[key].targetClass = value.model;
                });
            }
            modelName = model.name;
            modelBaseName = model.base || "Model";
        }
        catch (e) {
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
        }); // push
        schema.forEach(config => {
            console.info("Generating: %s", `${config.output}`);
            fs_1.writeFileSync(`${config.output}`, ejs.render(fs_1.readFileSync(require.resolve(config.template), { encoding: "utf-8" }), config.params));
        });
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
                return `Array<${buildPropertyType(prop[0].type)}>`;
            }
            // no type means it is interface
            return `Array<I${_.capitalize(propName)}>`;
        }
        else if (typeof prop == "object") {
            if (prop.type) {
                type = prop.type;
            }
            else {
                return `I${_.capitalize(propName)}`;
            }
        }
        else if (typeof prop === "string") {
            type = prop;
        }
    }
    else if (!type) {
        return "any";
    }
    // strip the quotes if any
    if (typeof type == 'string') {
        type = type.replace(/\"\'\s/g, "");
    }
    if (typeof type == 'object') {
        if (Array.isArray(type)) {
            return `Array<${buildPropertyType(type[0])}>`;
        }
        return "object";
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
function buildPropertyDefaultValue(property) {
    let defaultValue = (property.hasOwnProperty("default")) ? property.default : "";
    switch (typeof property.type) {
        case "function":
            switch (property.type.name) {
                case "String":
                    return `"${defaultValue}"`;
                case "Number":
                    return isNaN(Number(defaultValue)) ? 0 : Number(defaultValue);
                case "Boolean":
                    return Boolean(defaultValue);
                case "Date":
                    return isNaN(Date.parse(defaultValue)) ? `new Date(0)` : `new Date("${defaultValue}")`;
                case "GeoPoint":
                default:
                    return "<any>null";
            }
        case "object":
            if (Array.isArray(property.type)) {
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
    let basicType = (models[targetClass]) ? `I${targetClass}` : "any";
    let finalType = relation.type.match(/(hasOne|belongsTo)/g)
        ? basicType : `${basicType}[]`;
    return finalType;
}
function getModelRelations(model) {
    return Object.keys(model.relations).filter(relationName => model.relations[relationName].targetClass &&
        model.relations[relationName].targetClass !== model.name);
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
            let targetClass = model.relations[relationName].targetClass;
            if (!loaded[targetClass]) {
                loaded[targetClass] = true;
                output.push(`  ${targetClass}`);
            }
        });
    }
    // Add GeoPoint custom type import
    Object.keys(model.properties).forEach((property) => {
        var geoPointType = buildPropertyType(model.properties[property].type, property, model.properties);
        var hasGeoPointType = geoPointType.indexOf("GeoPoint") !== -1;
        if (hasGeoPointType) {
            output.push("  GeoPoint");
        }
    });
    if (output.length > 0) {
        var imports = output.join(",\n");
        output = [
            "import {",
            imports,
            "} from \"../index\";\n"
        ];
    }
    // build sub interfaces
    let interfaces = {};
    Object.keys(model.properties).forEach((propertyName) => {
        let property = model.properties[propertyName];
        if (!property.type) {
            let subModel = {
                properties: property,
                relations: {}
            };
            if (Array.isArray(property)) {
                subModel.properties = _.reduce(property, (m, c) => { return _.extend(m, c); });
            }
            interfaces['I' + _.capitalize(propertyName)] = buildModelProperties(subModel, true);
        }
    });
    _.each(_.keys(interfaces), (iface) => {
        output.push(`interface ${iface} { \n${interfaces[iface]} \n};\n`);
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
        if (model.isUser && property === "credentials")
            return;
        let meta = model.properties[property];
        let isOptional = isInterface && !meta.required ? "?" : "";
        let defaultValue = !isInterface ? ` = ${buildPropertyDefaultValue(meta)}` : "";
        // defaultValue = ctx.defaultValue !== "enabled" && ctx.defaultValue !== "strict" ? " : defaultValue;
        // defaultValue = ctx.defaultValue === "strict" && !meta.hasOwnProperty("default") ? " : defaultValue;
        output.push(`  /**`);
        if (model.properties[property].description) {
            console.log(model.properties[property].description);
            if (Array.isArray(model.properties[property].description)) {
                _.each(model.properties[property].description, desc => {
                    output.push(`   * ${desc}`);
                });
            }
            else {
                output.push(`   * ${model.properties[property].description}`);
            }
        }
        output.push(`   * @param ${buildPropertyType(meta.type, property, model.properties[property])}`);
        output.push(`   */`);
        output.push(`  ${property}${isOptional}: ${buildPropertyType(meta.type, property, model.properties[property])}${defaultValue};`);
    });
    // Add Model Relations
    Object.keys(model.relations).forEach(relation => {
        let relationType = buildRelationType(model, relation);
        // let defaultTypeValue = !isInterface && ctx.defaultValue === "enabled" && relationType.indexOf("Array") >= 0 ? " = []" : ";
        let defaultTypeValue = "";
        // defaultTypeValue = !isInterface && ctx.defaultValue === "enabled" && relationType.indexOf("Array") === -1 ? " = null" : defaultTypeValue;
        output.push(`  /**`);
        output.push(`   * ${model.relations[relation].type} relation for ${model.name}`);
        output.push(`   * @param ${relationType}`);
        output.push(`   */`);
        output.push(`  ${relation}${isInterface ? "?" : ""}: ${relationType}${defaultTypeValue};`);
    });
    return output.join("\n");
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = typescriptPlugin;
module.exports = typescriptPlugin;
module.exports.default = typescriptPlugin;
//# sourceMappingURL=index.js.map