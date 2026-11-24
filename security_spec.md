# Especificación de Seguridad — ÓpticaStudio

## 1. Invariantes de Datos

1. **Aislamiento de Personal y RBAC**: Ningún usuario no verificado o con rol `pending` / `active == false` puede leer ni listar pacientes, recetas, inventario, presupuestos, órdenes de trabajo o movimientos de caja.
2. **Prevención de Auto-Escalamiento de Privilegios**: Un usuario autenticado que no sea el administrador inicial ni un administrador activo solo puede crear su propio documento en `staffUsers` con `role: 'pending'` y `active: false`.
3. **Integridad de Identidad**: Todo registro creado por personal (`patients`, `prescriptions`, `appointments`, `quotes`, `workOrders`, `cashMovements`) debe coincidir con `request.auth.uid` en su campo de autoría (`createdBy`, `optometristId`, `sellerId`, `userId`).
4. **Integridad Referencial**: No se pueden crear `prescriptions`, `appointments`, `quotes` ni `workOrders` para un `patientId` inexistente en `patients`.
5. **Separación de Roles Clínicos y Comerciales**: Solo usuarios con rol `optometra` o `admin` pueden emitir o modificar `prescriptions`. Solo `vendedor` o `admin` pueden crear `quotes`, `workOrders` y `cashMovements`. Solo `admin` puede crear productos, modificar precios de costo/venta o eliminar registros.
6. **Bloqueo de Estados Terminales**: Las órdenes de trabajo con `status == 'delivered'`, presupuestos con `status == 'converted'` y turnos en `completed` / `cancelled` quedan bloqueados para edición salvo por un `admin`.
7. **Campos Inmutables y Tiempos de Servidor**: `createdAt`, `createdBy`, `optometristId`, `sellerId`, `userId` y `patientId` son inmutables tras la creación. `createdAt` y `updatedAt` exigen `request.time`.

## 2. Payloads "Dirty Dozen" (Pruebas Adversarias)

1. **Auto-asignación de rol Admin**: Usuario nuevo intenta crear `/staffUsers/{uid}` con `role: "admin", active: true`. -> `PERMISSION_DENIED`.
2. **Lectura de PII por usuario pendiente**: Usuario autenticado con `role: "pending"` intenta `list` o `get` en `/patients`. -> `PERMISSION_DENIED`.
3. **Suplantación de correo no verificado**: Token con email de admin pero `email_verified: false`. -> `PERMISSION_DENIED`.
4. **Campo fantasma (Shadow Field)**: Vendedor intenta crear paciente agregando `{ isVipBypass: true }` fuera del esquema. -> `PERMISSION_DENIED`.
5. **ID Poisoning**: Intento de crear documento en `/patients` con ID de 300 caracteres o caracteres inválidos (`../admin`). -> `PERMISSION_DENIED`.
6. **Emisión de receta por Vendedor**: Usuario con rol `vendedor` intenta crear un documento en `/prescriptions`. -> `PERMISSION_DENIED`.
7. **Manipulación de precio por Vendedor**: Usuario con rol `vendedor` intenta actualizar `salePrice` o `costPrice` en `/inventoryItems/{id}`. -> `PERMISSION_DENIED`.
8. **Suplantación de identidad en Venta**: Vendedor A intenta crear una `workOrder` con `sellerId: "otro_vendedor_uid"`. -> `PERMISSION_DENIED`.
9. **Registro huérfano sin paciente**: Intento de crear una receta con `patientId: "paciente_inexistente"`. -> `PERMISSION_DENIED`.
10. **Alteración de orden entregada**: Vendedor intenta modificar `totalAmount` o `status` de una `workOrder` cuyo `status` existente es `"delivered"`. -> `PERMISSION_DENIED`.
11. **Inyección de timestamp manipulado**: Creación de movimiento de caja con `createdAt` en el pasado para alterar arqueo histórico. -> `PERMISSION_DENIED`.
12. **Lectura de caja por usuario externo o sin rol**: Usuario no habilitado intenta leer `/cashMovements`. -> `PERMISSION_DENIED`.
