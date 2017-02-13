gulp-loopback-typescript
========================

Typescript definition file generator plugin for gulp.

to install gulp-loopback-typescript
```shell
npm install --save-dev gulp-loopback-typescript
```

to use gulp-loopback-typescript
```typescript
import loopbackTypescript from "gulp-loopback-typescript";

// in ES5
var loopbackTypescript = require("gulp-loopback-typescript");

gulp.task("loopbackTypescript", () =>
    gulp.src("common/models/*json")
        .pipe(loopbackTypescript({
            dest: "src/typescript/common/models"
        }));
);
```

Plugin generates index.d.ts file along with .d.ts files for each model
in your specified models directory. Definition files are deployed in the 
directory specified in the dest option.

Todo:
[ ] methods
[ ] relations