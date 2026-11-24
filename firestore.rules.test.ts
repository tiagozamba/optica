/**
 * Suite de verificación adversaria para las reglas de Firestore de ÓpticaStudio.
 * Documenta los 12 casos "Dirty Dozen" descritos en security_spec.md.
 */

export interface SecurityTestCase {
  id: string;
  title: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  actorRole: 'unauthenticated' | 'pending' | 'vendedor' | 'optometra' | 'unverified_admin';
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: SecurityTestCase[] = [
  {
    id: 'DD-01',
    title: 'Auto-asignación de rol administrador al registrarse',
    collection: 'staffUsers',
    operation: 'create',
    actorRole: 'pending',
    payload: {
      uid: 'attacker_uid',
      email: 'attacker@example.com',
      displayName: 'Atacante',
      role: 'admin',
      active: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-02',
    title: 'Lectura de pacientes por usuario pendiente sin habilitar',
    collection: 'patients',
    operation: 'list',
    actorRole: 'pending',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-03',
    title: 'Acceso con email sin verificar',
    collection: 'patients',
    operation: 'get',
    actorRole: 'unverified_admin',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-04',
    title: 'Inyección de campo fantasma en ficha de paciente',
    collection: 'patients',
    operation: 'create',
    actorRole: 'vendedor',
    payload: {
      fullName: 'Juan Pérez',
      dni: '30111222',
      phone: '1155550000',
      email: '',
      insuranceName: 'OSDE',
      notes: '',
      ghostFlag: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-05',
    title: 'ID Poisoning con caracteres inválidos o longitud excesiva',
    collection: 'patients',
    operation: 'create',
    actorRole: 'vendedor',
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-06',
    title: 'Vendedor intenta emitir receta clínica optométrica',
    collection: 'prescriptions',
    operation: 'create',
    actorRole: 'vendedor',
    payload: {
      patientId: 'patient_1',
      lensType: 'Monofocal',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-07',
    title: 'Vendedor intenta modificar precio de venta o costo en inventario',
    collection: 'inventoryItems',
    operation: 'update',
    actorRole: 'vendedor',
    payload: {
      salePrice: 1,
      costPrice: 0,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-08',
    title: 'Suplantación de sellerId al crear orden de trabajo',
    collection: 'workOrders',
    operation: 'create',
    actorRole: 'vendedor',
    payload: {
      sellerId: 'different_seller_uid',
      patientId: 'patient_1',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-09',
    title: 'Receta huérfana referenciando patientId inexistente',
    collection: 'prescriptions',
    operation: 'create',
    actorRole: 'optometra',
    payload: {
      patientId: 'non_existent_patient',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-10',
    title: 'Edición por vendedor de orden ya entregada (estado terminal)',
    collection: 'workOrders',
    operation: 'update',
    actorRole: 'vendedor',
    payload: {
      status: 'pending',
      totalAmount: 0,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-11',
    title: 'Manipulación de createdAt en movimiento de caja',
    collection: 'cashMovements',
    operation: 'create',
    actorRole: 'vendedor',
    payload: {
      amount: 5000,
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 'DD-12',
    title: 'Optómetra o usuario pendiente intenta leer movimientos de caja',
    collection: 'cashMovements',
    operation: 'list',
    actorRole: 'optometra',
    expectedResult: 'PERMISSION_DENIED',
  },
];
