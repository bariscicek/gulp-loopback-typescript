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

Plugin updates loopback.d.ts file with the model definition data of each
model exists in *modelDir* option. If there is no loopback definition file
it is asked to be installed from [npm].

### Todo:
- [ ] model methods
- [x] relations
- [ ] handling default values