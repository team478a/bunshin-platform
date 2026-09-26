import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const IGNORED_DIRECTORIES = new Set(['dist', 'generated', 'node_modules', '.next', 'coverage']);

const CORE_PACKAGES = new Set([
  '@bunshin/platform-domain',
  '@bunshin/shared',
  '@bunshin/capability-contract',
]);

const APPLICATION_FORBIDDEN_EXTERNALS = [
  '@prisma/client',
  'next',
  'react',
  'react-dom',
  'openai',
  '@google/generative-ai',
  '@line/bot-sdk',
  'stripe',
  'resend',
];

function normalize(filePath) {
  return path.resolve(filePath).replaceAll('\\', '/');
}

function isInside(candidate, parent) {
  const normalizedCandidate = `${normalize(candidate)}/`;
  const normalizedParent = `${normalize(parent)}/`;
  return normalizedCandidate.startsWith(normalizedParent);
}

function matchesPackage(specifier, packageName) {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
}

function findOwner(filePath, packages, repoRoot) {
  const workspacePackage = packages.find((entry) => isInside(filePath, entry.root));
  if (workspacePackage) {
    return { kind: 'package', ...workspacePackage };
  }

  const webRoot = path.join(repoRoot, 'apps', 'web');
  if (isInside(filePath, webRoot)) {
    return { kind: 'web', name: 'apps/web', root: webRoot, exports: new Set() };
  }

  return null;
}

function findPackageBySpecifier(specifier, packages) {
  return packages.find((entry) => matchesPackage(specifier, entry.name)) ?? null;
}

function moduleReferences(sourceFile) {
  const references = [];

  function add(node, kind) {
    if (node && ts.isStringLiteralLike(node)) {
      references.push({ specifier: node.text, kind, position: node.getStart(sourceFile) });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, 'import');
    } else if (ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, 're-export');
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1
    ) {
      add(node.arguments[0], 'dynamic import');
    } else if (ts.isImportTypeNode(node)) {
      add(node.argument.literal, 'import type');
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression, 'import equals');
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

function lineAndColumn(sourceFile, position) {
  const value = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: value.line + 1, column: value.character + 1 };
}

function violation(sourceFile, filePath, reference, code, message) {
  return {
    filePath,
    specifier: reference.specifier,
    referenceKind: reference.kind,
    code,
    message,
    ...lineAndColumn(sourceFile, reference.position),
  };
}

export function analyzeSourceFile({ repoRoot, filePath, sourceText, packages }) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const owner = findOwner(filePath, packages, repoRoot);
  if (!owner) return [];

  const violations = [];
  for (const reference of moduleReferences(sourceFile)) {
    const { specifier } = reference;
    const targetPackage = findPackageBySpecifier(specifier, packages);

    if (targetPackage && specifier !== targetPackage.name) {
      const subpath = `./${specifier.slice(targetPackage.name.length + 1)}`;
      if (!targetPackage.exports.has(subpath)) {
        violations.push(
          violation(
            sourceFile,
            filePath,
            reference,
            'PUBLIC_ENTRY_BYPASS',
            `${targetPackage.name} must be imported through a declared package export`,
          ),
        );
      }
    }

    let relativeTargetOwner = null;
    if (specifier.startsWith('.')) {
      const resolvedTarget = path.resolve(path.dirname(filePath), specifier);
      relativeTargetOwner = findOwner(resolvedTarget, packages, repoRoot);
      if (
        owner.kind === 'package' &&
        relativeTargetOwner?.kind === 'package' &&
        owner.name !== relativeTargetOwner.name
      ) {
        violations.push(
          violation(
            sourceFile,
            filePath,
            reference,
            'CROSS_PACKAGE_RELATIVE',
            `${owner.name} must use ${relativeTargetOwner.name}'s public package entry instead of a relative path`,
          ),
        );
      }
    }

    const targetName = targetPackage?.name ?? relativeTargetOwner?.name ?? null;
    if (owner.kind === 'package' && CORE_PACKAGES.has(owner.name)) {
      if (targetName === '@bunshin/database' || relativeTargetOwner?.kind === 'web') {
        violations.push(
          violation(
            sourceFile,
            filePath,
            reference,
            'CORE_DEPENDENCY_DIRECTION',
            `${owner.name} cannot depend on database or apps/web implementation`,
          ),
        );
      }
    }

    if (owner.name === '@bunshin/application') {
      if (targetName === '@bunshin/database' || relativeTargetOwner?.kind === 'web') {
        violations.push(
          violation(
            sourceFile,
            filePath,
            reference,
            'APPLICATION_DEPENDENCY_DIRECTION',
            '@bunshin/application cannot depend on database or apps/web implementation',
          ),
        );
      }

      const external = APPLICATION_FORBIDDEN_EXTERNALS.find((name) =>
        matchesPackage(specifier, name),
      );
      if (external) {
        violations.push(
          violation(
            sourceFile,
            filePath,
            reference,
            'APPLICATION_FRAMEWORK_OR_PROVIDER',
            `@bunshin/application cannot depend directly on ${external}`,
          ),
        );
      }
    }
  }

  return violations;
}

export function discoverPackages(repoRoot) {
  const packagesRoot = path.join(repoRoot, 'packages');
  return fs
    .readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const root = path.join(packagesRoot, entry.name);
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const declaredExports =
        manifest.exports && typeof manifest.exports === 'object'
          ? Object.keys(manifest.exports)
          : ['.'];
      return { name: manifest.name, root, exports: new Set(declaredExports) };
    });
}

function collectFiles(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, files);
    } else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

export function checkRepository(repoRoot) {
  const packages = discoverPackages(repoRoot);
  const roots = [
    ...packages.map((entry) => path.join(entry.root, 'src')),
    path.join(repoRoot, 'apps', 'web', 'app'),
    path.join(repoRoot, 'apps', 'web', 'src'),
  ];

  return roots.flatMap((root) =>
    collectFiles(root).flatMap((filePath) =>
      analyzeSourceFile({
        repoRoot,
        filePath,
        sourceText: fs.readFileSync(filePath, 'utf8'),
        packages,
      }),
    ),
  );
}
