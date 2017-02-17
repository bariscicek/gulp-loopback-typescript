gulp-loopback-typescript
========================

Typescript definition file generator plugin for gulp.

to install gulp-loopback-typescript
```shell
npm install --save-dev gulp-loopback-typescript
```

to use gulp-loopback-typescript
```typescript
import { loopbackTypescript } from "gulp-loopback-typescript";

// in ES5
var loopbackTypescript = require("gulp-loopback-typescript");

gulp.task("loopbackTypescript", () =>
    return gulp.src("common/models/*json")
              .pipe(loopbackTypescript({
                // dest: "node_modules/@types/loopback",
                // modelDir: "src/typescript/common/models"
              }));
);
```

Plugin updates @types/loopback/index.d.ts file with the model definition 
data of each model exists in *modelDir* option. 

Note: If typings definition file of loopback exists that file will be 
updated, otherwise plugin copy will be replaced.

### Known bugs:
- [ ] Properties with "type" name causes problem (ie. { "type": { "type": "string" }})

### Todo:
- [ ] model methods
- [x] relations
- [ ] handling default values