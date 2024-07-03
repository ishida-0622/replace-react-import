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

  // Collect all React.* usages and types
  const reactMethods = new Set<string>();
  const reactTypes = new Set<string>();

  const root = j(fileInfo.source);

  // Find all React.* expressions
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

  // Find all React.* type references
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

  // Find all React.* JSX elements
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

  // Remove existing import React from 'react' and import * as React from 'react'
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

  // Create a single import declaration for all React methods
  if (reactMethods.size > 0) {
    const importDeclaration = j.importDeclaration(
      Array.from(reactMethods).map((method) =>
        j.importSpecifier(j.identifier(method))
      ),
      j.literal('react')
    );
    root.get().node.program.body.unshift(importDeclaration);
  }

  // Create a single import type declaration for all React types
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

  // Replace React.method() with method()
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

  // Replace React.Type with Type, keeping the type parameters
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

  // Handle generic type arguments with React.* inside them
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

  // Replace <React.Element> with <Element>
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

  // Replace interface Props extends React.Type with interface Props extends Type
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
