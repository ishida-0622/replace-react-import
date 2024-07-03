import {
  API,
  FileInfo,
  JSCodeshift,
  MemberExpression,
  TSTypeReference,
  JSXMemberExpression,
  ImportDeclaration,
  ImportDefaultSpecifier,
  ImportNamespaceSpecifier,
  TSInterfaceDeclaration,
} from 'jscodeshift';

const transform = (fileInfo: FileInfo, api: API) => {
  const j: JSCodeshift = api.jscodeshift;

  // React.* のメソッドと型を格納するセット
  const reactMethods = new Set<string>();
  const reactTypes = new Set<string>();

  const root = j(fileInfo.source);

  // React.* のメソッドを見つける（React.useStateなど）
  root
    .find<MemberExpression>(j.MemberExpression, {
      object: { name: 'React' },
    })
    .forEach((path) => {
      const { property } = path.value;
      if (property.type === 'Identifier') {
        reactMethods.add(property.name);
      }
    });

  // React.* の型参照を見つける（React.ReactElementなど）
  root
    .find<TSTypeReference>(j.TSTypeReference, {
      typeName: {
        type: 'TSQualifiedName',
        left: { name: 'React' },
      },
    })
    .forEach((path) => {
      const { typeName } = path.value;
      if (
        typeName.type === 'TSQualifiedName' &&
        typeName.right.type === 'Identifier'
      ) {
        reactTypes.add(typeName.right.name);
      }
    });

  // JSX 内の React.* メソッドを見つける（ <React.Fragment> など）
  root
    .find<JSXMemberExpression>(j.JSXMemberExpression, {
      object: { name: 'React' },
    })
    .forEach((path) => {
      const { property } = path.value;
      if (property.type === 'JSXIdentifier') {
        reactMethods.add(property.name);
      }
    });

  // 既存の import React from 'react' と import * as React from 'react' を削除する
  root
    .find<ImportDeclaration>(j.ImportDeclaration, {
      source: { value: 'react' },
    })
    .forEach((path) => {
      const specifiers = path.value.specifiers;
      const defaultSpecifier = specifiers?.find(
        (specifier) => specifier.type === 'ImportDefaultSpecifier'
      ) as ImportDefaultSpecifier;
      const namespaceSpecifier = specifiers?.find(
        (specifier) => specifier.type === 'ImportNamespaceSpecifier'
      ) as ImportNamespaceSpecifier;

      if (
        (defaultSpecifier && defaultSpecifier.local?.name === 'React') ||
        (namespaceSpecifier && namespaceSpecifier.local?.name === 'React')
      ) {
        j(path).remove();
      }
    });

  // 全ての React メソッドに対する1つのインポート宣言を作成する
  if (reactMethods.size > 0) {
    const importDeclaration = j.importDeclaration(
      Array.from(reactMethods).map((method) =>
        j.importSpecifier(j.identifier(method))
      ),
      j.literal('react')
    );
    root.get().node.program.body.unshift(importDeclaration);
  }

  // 全ての React 型に対する1つのインポート型宣言を作成する
  if (reactTypes.size > 0) {
    const importTypeDeclaration = j.importDeclaration(
      Array.from(reactTypes).map((type) =>
        j.importSpecifier(j.identifier(type))
      ),
      j.literal('react')
    );
    importTypeDeclaration.importKind = 'type';
    root.get().node.program.body.unshift(importTypeDeclaration);
  }

  // React.method() を method() に置き換える
  root
    .find<MemberExpression>(j.MemberExpression, {
      object: { name: 'React' },
    })
    .forEach((path) => {
      const { property } = path.value;
      if (property.type === 'Identifier' && reactMethods.has(property.name)) {
        j(path).replaceWith(j.identifier(property.name));
      }
    });

  // React.Type を Type に置き換える
  root
    .find<TSTypeReference>(j.TSTypeReference, {
      typeName: {
        type: 'TSQualifiedName',
        left: { name: 'React' },
      },
    })
    .forEach((path) => {
      const { typeName } = path.value;
      if (
        typeName.type === 'TSQualifiedName' &&
        typeName.right.type === 'Identifier' &&
        reactTypes.has(typeName.right.name)
      ) {
        j(path).replaceWith(
          j.tsTypeReference(
            j.identifier(typeName.right.name),
            path.value.typeParameters
          )
        );
      }
    });

  // React.* が含まれるジェネリック型引数を処理する
  root.find<TSTypeReference>(j.TSTypeReference).forEach((path) => {
    if (path.value.typeParameters) {
      j(path.value.typeParameters.params).forEach((param) => {
        if (
          param.value.type === 'TSTypeReference' &&
          param.value.typeName.type === 'TSQualifiedName' &&
          param.value.typeName.left.name === 'React' &&
          param.value.typeName.right.type === 'Identifier' &&
          reactTypes.has(param.value.typeName.right.name)
        ) {
          param.replace(
            j.tsTypeReference(
              j.identifier(param.value.typeName.right.name),
              param.value.typeParameters
            )
          );
        }
      });
    }
  });

  // JSX 内の <React.Element> を <React.Element> に置き換える（ <React.Fragment> など）
  root
    .find<JSXMemberExpression>(j.JSXMemberExpression, {
      object: { name: 'React' },
    })
    .forEach((path) => {
      const { property } = path.value;
      if (
        property.type === 'JSXIdentifier' &&
        reactMethods.has(property.name)
      ) {
        j(path).replaceWith(j.jsxIdentifier(property.name));
      }
    });

  // interface Props extends React.Type を interface Props extends Type に置き換える
  root
    .find<TSInterfaceDeclaration>(j.TSInterfaceDeclaration)
    .forEach((path) => {
      if (path.value.extends) {
        path.value.extends.forEach((extend) => {
          if (
            extend.expression.type === 'TSQualifiedName' &&
            extend.expression.left.type === 'Identifier' &&
            extend.expression.left.name === 'React' &&
            extend.expression.right.type === 'Identifier' &&
            reactTypes.has(extend.expression.right.name)
          ) {
            extend.expression = j.identifier(extend.expression.right.name);
          }
        });
      }
    });

  return root.toSource();
};

export default transform;
