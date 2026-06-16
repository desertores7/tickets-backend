# Migraciones de Base de Datos

Este directorio contiene las migraciones de TypeORM para el proyecto MultiChatBackend.

## Comandos Disponibles

### Generar una nueva migración automáticamente

Genera una migración basada en los cambios detectados en las entidades:

```bash
pnpm migration:generate -- src/migrations/NombreDeLaMigracion
```

**Ejemplo:**
```bash
pnpm migration:generate -- src/migrations/AddNewColumnToUser
```

### Crear una migración vacía

Crea un archivo de migración vacío para escribir manualmente:

```bash
pnpm migration:create -- src/migrations/NombreDeLaMigracion
```

**Ejemplo:**
```bash
pnpm migration:create -- src/migrations/CustomDataMigration
```

### Ejecutar migraciones pendientes

Ejecuta todas las migraciones que aún no se han aplicado:

```bash
pnpm migration:run
```

### Revertir la última migración

Revierte la última migración ejecutada:

```bash
pnpm migration:revert
```

### Ver el estado de las migraciones

Muestra qué migraciones se han ejecutado y cuáles están pendientes:

```bash
pnpm migration:show
```

## Configuración

Las migraciones están configuradas en `src/config/db/data-source.ts` y utilizan las mismas credenciales de base de datos que la aplicación principal.

### Variables de Entorno Requeridas

Para desarrollo local:
- `DB_CONNECTION_DATA`: JSON string con `{host, port, username, password, database}`

Para producción:
- `DB_CONNECTION_DATA`: JSON string con `{host, port, username, password, database}`

## Flujo de Trabajo Recomendado

1. **Hacer cambios en las entidades** (agregar columnas, tablas, índices, etc.)

2. **Generar la migración automáticamente:**
   ```bash
   pnpm migration:generate -- src/migrations/DescripcionDelCambio
   ```

3. **Revisar el archivo de migración generado** en `src/migrations/`

4. **Ejecutar la migración en desarrollo:**
   ```bash
   pnpm migration:run
   ```

5. **Verificar que todo funcione correctamente**

6. **Commitear los cambios** (entidades + archivo de migración)

7. **En producción, ejecutar:**
   ```bash
   pnpm migration:run
   ```

## Notas Importantes

- ⚠️ **NUNCA** edites una migración que ya se haya ejecutado en producción
- ✅ Siempre crea una nueva migración para hacer cambios adicionales
- ✅ Revisa siempre las migraciones generadas antes de ejecutarlas
- ✅ Haz backup de la base de datos antes de ejecutar migraciones en producción
- ✅ Las migraciones se ejecutan en orden cronológico según su timestamp

## Estructura de una Migración

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class NombreMigracion1234567890 implements MigrationInterface {
  name = 'NombreMigracion1234567890'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Código para aplicar la migración
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Código para revertir la migración
  }
}
```

## Solución de Problemas

### Error: "No migrations found"

Asegúrate de que:
- Los archivos de migración estén en `src/migrations/`
- Los archivos tengan la extensión `.ts`
- El nombre del archivo siga el patrón: `NombreMigracion1234567890.ts`

### Error: "Migration already executed"

La migración ya se ejecutó. Si necesitas cambiarla:
1. Revierte la migración: `pnpm migration:revert`
2. Edita el archivo de migración
3. Ejecuta nuevamente: `pnpm migration:run`

### Error: "Cannot find module"

Asegúrate de tener todas las dependencias instaladas:
```bash
pnpm install
```

