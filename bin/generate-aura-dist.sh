#!/bin/bash
if [ -z "$1" ]
  then
    echo "No path supplied"
    exit 1
fi

FILEPATH=$1
npm run build:artifacts
# engine versions
cp  ./packages/raptor-engine/dist/umd/es2017/engine* $FILEPATH/aura-resources/src/main/resources/aura/resources/engine/
# compat-helpers
cp  ./packages/raptor-compat/dist/umd/compat.* $FILEPATH/aura-resources/src/main/resources/aura/resources/compat-helpers/
cp  ./packages/raptor-compat/dist/umd/downgrade.js $FILEPATH/aura-resources/src/main/resources/aura/resources/compat-helpers/downgrade.js
# compiler
cp  ./packages/raptor-compiler/dist/umd/compiler.js $FILEPATH/aura-modules/src/main/resources/modules/compiler.js
