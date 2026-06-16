import * as fs from 'fs';
import * as path from 'path';
import { Project, SourceFile, SyntaxKind } from 'ts-morph';
import fg from 'fast-glob';
import { entitiesData } from '../meta/db.data';
import { TEntityName } from '../meta/db.types';

function getConstStringValue(sourceFile: SourceFile, varName: string): string | null {
  try {
    // Buscar la declaración de la variable
    const declaration = sourceFile.getVariableDeclarationOrThrow(varName);

    // Obtener el inicializador (expresión que inicializa la variable)
    const initializer = declaration.getInitializerOrThrow();

    // Si el inicializador es un StringLiteral, obtenemos su texto
    if (initializer.getKind() === SyntaxKind.StringLiteral) {
      return initializer.getText().replace(/['"]/g, ''); // Quitar las comillas de alrededor
    }

    // Si es una expresión de tipo "as const", encontramos el literal dentro
    if (initializer.getKind() === SyntaxKind.AsExpression) {
      const literal = initializer.getFirstDescendantByKind(SyntaxKind.StringLiteral);
      if (literal) {
        return literal.getText().replace(/['"]/g, ''); // Quitar las comillas de alrededor
      }
    }

    // Si es otro tipo de expresión compleja, devolvemos null
    console.log('[DEBUG] Initializer kind no es un StringLiteral:', initializer.getKindName());
    console.log('[DEBUG] Initializer text:', initializer.getText()); // Verificamos el texto de la expresión
    return null;
  } catch (err) {
    console.log('\n');
    console.warn(sourceFile.getBaseName());
    console.warn(`⚠️ No se pudo obtener valor de "${varName}":`, err);

    return null;
  }
}

async function main() {
  console.log('Current directory:', __dirname);
  console.log('Starting script...');

  const RELATION_DECORATORS = ['OneToOne', 'OneToMany', 'ManyToOne', 'ManyToMany'];
  const tablesAddedToDbData = entitiesData.map(entity => entity.name);
  const tablesProcessed: TEntityName[] = [];

  async function generateEntityRelations() {
    console.log('Starting generateEntityRelations...');
    const project = new Project();

    // Verificar si el directorio existe
    const entitiesDir = path.resolve(__dirname, '../entities');
    console.log('Entities directory:', entitiesDir);
    if (!fs.existsSync(entitiesDir)) {
      console.error('Entities directory does not exist!');
      return;
    }

    // Listar archivos en el directorio
    const dirContents = fs.readdirSync(entitiesDir);
    console.log('Directory contents:', dirContents);

    const searchPath = path.join(entitiesDir, '*.entity.ts');
    console.log('Searching for files in:', searchPath);
    const files = await fg(['**/*.entity.ts'], {
      cwd: entitiesDir,
      absolute: true,
      onlyFiles: true,
      ignore: ['node_modules'],
      dot: false
    });
    console.log('Found files:', files);

    if (files.length === 0) {
      console.error('No files found!');
      return;
    }

    const relationsMap: Record<string, { [key: string]: string }> = {};

    for (const filePath of files) {
      const sourceFile = project.getSourceFile(filePath) || project.addSourceFileAtPath(filePath);

      const classDeclaration = sourceFile.getClasses()[0];
      if (!classDeclaration) continue;

      const entityName = getConstStringValue(sourceFile, 'tableName');

      if (!entityName) continue;

      tablesProcessed.push(entityName as TEntityName);

      const relations: { [key: string]: string } = {};

      for (const property of classDeclaration.getProperties()) {
        const decorators = property.getDecorators();

        for (const decorator of decorators) {
          const name = decorator.getName();

          if (RELATION_DECORATORS.includes(name)) {
            const propertyType = property.getTypeNode()?.getText().replace('[]', '') || '';
            const importText =
              sourceFile
                .getImportDeclaration(id => id.getNamedImports().some(i => i.getName() === propertyType))
                ?.getText() || '';

            // Extraer el path del import usando regex para soportar comillas simples y dobles
            const pathMatch = importText.match(/from\s+['"]([^'"]+)['"]/);
            const typeImportPath = pathMatch ? pathMatch[1] : '';

            const processedTypeImportPath = typeImportPath.includes('@config')
              ? typeImportPath.replace('@config/', 'src/config/')
              : path.resolve(path.dirname(filePath), typeImportPath);

            console.log(typeImportPath);
            console.log(processedTypeImportPath);

            const withTsExtension = processedTypeImportPath.includes('.ts')
              ? processedTypeImportPath
              : processedTypeImportPath + '.ts';

            const currentEntitySourceFile =
              project.getSourceFile(withTsExtension) || project.addSourceFileAtPath(withTsExtension);

            const entityName = getConstStringValue(currentEntitySourceFile, 'tableName');

            relations[property.getName()] = entityName || 'error';
            break;
          }
        }
      }

      relationsMap[entityName] = relations;
    }

    // check if all tables are added to db.data.ts
    const tablesNotAdded = tablesProcessed.filter(table => !tablesAddedToDbData.includes(table));
    if (tablesNotAdded.length > 0) {
      throw new Error(`Las siguientes tablas no están agregadas a db.data.ts: ${tablesNotAdded.join(', ')}`);
    }

    // Crear el archivo TypeScript con el resultado
    const output = `// This file was generated automatically ${new Date().toISOString()}

export const entityRelations = ${JSON.stringify(relationsMap, null, 2)} as const;
`;

    fs.writeFileSync(path.resolve(__dirname, '../meta/entity-relations.ts'), output, 'utf-8');
    console.log('✅ Archivo entity-relations.ts generado.');
  }

  generateEntityRelations();
}

main().catch(error => console.log(error));
