"use strict";
var through = require("through2");
var ejs = require("ejs");
var _ = require("lodash");
var path = require("path");
var pluralize = require("pluralize");
var fs_1 = require("fs");
ejs.filters.pluralize = function (text) { return pluralize.plural(text); };
var models = [];
;
;
;
var typescriptPlugin = function (options) {
    if (!options.dest) {
        options.dest = path.join(__dirname, "..", "@types", "loopback");
    }
    if (!options.modelDir) {
        options.modelDir = path.join(__dirname, "..", "..", "src", "typescript", "common", "models");
    }
    models = _.map(_.filter(fs_1.readdirSync(options.modelDir), function (dir) { return dir.indexOf(".json") !== -1; }), function (modelFile) {
        var modelFileContent = fs_1.readFileSync(path.join(options.modelDir, modelFile));
        var modelFileContentObject = {
            name: null
        };
        try {
            modelFileContentObject = JSON.parse(modelFileContent.toString("utf-8"));
            return modelFileContentObject;
        }
        catch (e) {
            console.warn("Could not read the model file for " + modelFile);
            return null;
        }
    }); // map
    _.each(_.clone(models), function (model) {
        models[model.name] = model;
    });
    var schema = [
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
    var stream = through.obj(function (file, enc, callback) {
        var model = {};
        var modelName = null;
        try {
            model = JSON.parse(file.toString("utf-8"));
            modelName = model.name;
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
            output: options.dest + "/models/" + modelName + ".ts",
            params: {
                model: model,
                modelName: modelName,
                plural: ejs.filters.pluralize(modelName),
                buildPropertyType: buildPropertyType,
                buildPropertyDefaultValue: buildPropertyDefaultValue,
                buildRelationType: buildRelationType,
                buildModelImports: buildModelImports,
                buildModelProperties: buildModelProperties
            }
        }); // push
        schema.forEach(function (config) {
            console.info("Generating: %s", "" + config.output);
            fs_1.writeFileSync("" + config.output, ejs.render(fs_1.readFileSync(require.resolve(config.template), { encoding: "utf-8" }), config.params));
        });
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
            switch (type.name) {
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
            if (Array.isArray(type)) {
                return "Array<" + buildPropertyType(type[0]) + ">";
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
    var defaultValue = (property.hasOwnProperty("default")) ? property.default : "";
    switch (typeof property.type) {
        case "function":
            switch (property.type.name) {
                case "String":
                    return "\"" + defaultValue + "\"";
                case "Number":
                    return isNaN(Number(defaultValue)) ? 0 : Number(defaultValue);
                case "Boolean":
                    return Boolean(defaultValue);
                case "Date":
                    return isNaN(Date.parse(defaultValue)) ? "new Date(0)" : "new Date(\"" + defaultValue + "\")";
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
    var relation = model.sharedClass.ctor.relations[relationName];
    var targetClass = relation.targetClass;
    var basicType = (models[targetClass]) ? targetClass : "any";
    var finalType = relation.type.match(/(hasOne|belongsTo)/g)
        ? basicType : basicType + "[]";
    return finalType;
}
function getModelRelations(model) {
    return Object.keys(model.sharedClass.ctor.relations).filter(function (relationName) {
        return model.sharedClass.ctor.relations[relationName].targetClass &&
            model.sharedClass.ctor.relations[relationName].targetClass !== model.name;
    });
}
/**
 * @method buildModelImports
 * @description
 * Define import statement for those model who are related to other scopes
 */
function buildModelImports(model) {
    var relations = getModelRelations(model);
    var loaded = {};
    var output = [];
    if (relations.length > 0) {
        relations.forEach(function (relationName, i) {
            var targetClass = model.sharedClass.ctor.relations[relationName].targetClass;
            if (!loaded[targetClass]) {
                loaded[targetClass] = true;
                output.push("  " + targetClass);
            }
        });
    }
    // Add GeoPoint custom type import
    Object.keys(model.properties).forEach(function (property) {
        var geoPointType = buildPropertyType(model.properties[property].type);
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
    return output.join("\n");
}
/**
 * @method buildModelProperties
 * @description
 * Define properties for the given model
 */
function buildModelProperties(model, isInterface) {
    var output = [];
    // Add Model Properties
    Object.keys(model.properties).forEach(function (property) {
        if (model.isUser && property === "credentials")
            return;
        var meta = model.properties[property];
        var isOptional = isInterface && !meta.required ? "?" : "";
        var defaultValue = !isInterface ? " = " + buildPropertyDefaultValue(meta) : "";
        // defaultValue = ctx.defaultValue !== "enabled" && ctx.defaultValue !== "strict" ? " : defaultValue;
        // defaultValue = ctx.defaultValue === "strict" && !meta.hasOwnProperty("default") ? " : defaultValue;
        output.push("  " + property + isOptional + ": " + buildPropertyType(meta.type) + defaultValue + ";");
    });
    // Add Model Relations
    Object.keys(model.sharedClass.ctor.relations).forEach(function (relation) {
        var relationType = buildRelationType(model, relation);
        // let defaultTypeValue = !isInterface && ctx.defaultValue === "enabled" && relationType.indexOf("Array") >= 0 ? " = []" : ";
        var defaultTypeValue = "";
        // defaultTypeValue = !isInterface && ctx.defaultValue === "enabled" && relationType.indexOf("Array") === -1 ? " = null" : defaultTypeValue;
        output.push("  " + relation + (isInterface ? "?" : "") + ": " + relationType + defaultTypeValue + ";");
    });
    return output.join("\n");
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = typescriptPlugin;
module.exports = typescriptPlugin;
module.exports.default = typescriptPlugin;
//# sourceMappingURL=index.js.map