# Recuperación de respaldos de Tools4Care

## Alcance

Este kit recupera la base de datos PostgreSQL de Tools4Care desde los archivos
cifrados guardados en el servidor doméstico. La restauración siempre debe
realizarse primero en un proyecto Supabase nuevo.

El respaldo de PostgreSQL contiene tablas, registros, funciones, vistas,
políticas y demás objetos accesibles mediante `pg_dump`. No incluye por sí solo
el contenido binario de archivos almacenados en Supabase Storage, variables de
Vercel ni secretos de Edge Functions.

## Descargar el respaldo más reciente a la Mac

Desde la carpeta del proyecto:

```bash
./scripts/download-home-backup.sh edwin@192.168.1.174
```

El script:

1. Localiza el respaldo más reciente.
2. Verifica su checksum en el servidor.
3. Descarga el archivo cifrado y su checksum.
4. Vuelve a verificar el archivo en la Mac.

Destino predeterminado:

```text
~/Desktop/Tools4Care-Recuperacion
```

Fuera de la red doméstica, con Tailscale activo:

```bash
./scripts/download-home-backup.sh edwin@100.65.239.113
```

## Instalar y comprobar la herramienta de recuperación

```bash
./scripts/setup-home-recovery.sh edwin@192.168.1.174
```

La instalación ejecuta una comprobación real: checksum, descifrado temporal y
lectura con `pg_restore`. No modifica ninguna base de datos.

Para repetir la comprobación en el servidor:

```bash
~/.local/bin/tools4care-home-recovery
```

## Restaurar después de una emergencia

1. Crear un proyecto Supabase nuevo.
2. En el panel del proyecto nuevo, abrir **Connect**.
3. Seleccionar **Session pooler**, URI y puerto 5432.
4. Ejecutar en el servidor:

```bash
~/.local/bin/tools4care-home-recovery --restore
```

5. Proporcionar el host, usuario y contraseña PostgreSQL del proyecto nuevo.
6. Escribir la confirmación solicitada.
7. Esperar a que termine la restauración.

La herramienta bloquea el usuario del proyecto de producción actual. También
usa una sola transacción: si `pg_restore` encuentra un error, PostgreSQL revierte
la operación en vez de dejar una restauración parcial.

## Validación posterior

Antes de conectar la aplicación al proyecto recuperado, comprobar:

- Clientes y balances.
- Productos e inventario.
- Ventas y detalles.
- Pagos y cuentas por cobrar.
- Usuarios y acceso.
- Funciones, vistas y políticas RLS.
- Integraciones que dependan de Edge Functions o Storage.

El cambio de producción requiere actualizar en Vercel las variables del nuevo
proyecto Supabase y desplegar una versión nueva. Ese cambio no está automatizado
para evitar activar accidentalmente una base sin validar.

## Seguridad

- Mantener la clave de cifrado fuera del servidor doméstico.
- No restaurar directamente sobre producción.
- No enviar contraseñas por chat.
- Conservar al menos una copia descargada fuera de la vivienda.
- Realizar periódicamente una restauración de ensayo en un proyecto temporal.
