# replace-react-import

`import * as React from 'react'`や`import React from 'react'`を`import { Method } from react`や`import type { Type } from 'react'`に置き換えます

実行するコマンド

```shell
jscodeshift -t transform.ts /replace-target-path --parser=tsx
```

適用する拡張子を指定したい場合

```shell
jscodeshift -t transform.ts /replace-target-path --extensions=ts,tsx --parser=tsx
```
