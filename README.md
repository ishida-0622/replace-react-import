# replace-react-import

`import * as React from 'react'`や`import React from 'react'`を`import { method } from react`や`import type { Type } from 'react'`に置き換えます

実行するコマンド

```shell
jscodeshift -t transform.ts /replace-target-path --extensions=ts,tsx --parser=tsx
```
