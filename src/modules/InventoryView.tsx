import React, { useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  formatCurrency,
  INVENTORY_CATEGORY_LABELS,
  sanitizeSku,
} from '../lib/formatters';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { useToast } from '../components/Toast';
import {
  BLUEPRINT_LIMITS,
  InventoryCategory,
  StaffRole,
  type InventoryItem,
  type StaffUser,
} from '../types/optics';

interface InventoryViewProps {
  currentUser: StaffUser;
  items: InventoryItem[];
  loading: boolean;
  modalOpen: boolean;
  onSetModalOpen: (open: boolean) => void;
}

export function InventoryView({
  currentUser,
  items,
  loading,
  modalOpen,
  onSetModalOpen,
}: InventoryViewProps) {
  const { notifySuccess, notifyError } = useToast();
  const [categoryFilter, setCategoryFilter] = useState<'all' | InventoryCategory>('all');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Form
  const [sku, setSku] = useState('');
  const [category, setCategory] = useState<InventoryCategory>(InventoryCategory.FRAME);
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [specs, setSpecs] = useState('');
  const [costPrice, setCostPrice] = useState('0');
  const [salePrice, setSalePrice] = useState('0');
  const [stock, setStock] = useState('1');
  const [minStock, setMinStock] = useState('2');
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = currentUser.role === StaffRole.ADMIN;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
        if (onlyLowStock && item.stock > item.minStock) return false;
        if (
          q &&
          !item.sku.toLowerCase().includes(q) &&
          !item.brand.toLowerCase().includes(q) &&
          !item.model.toLowerCase().includes(q) &&
          !item.specs.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.brand.localeCompare(b.brand));
  }, [items, categoryFilter, onlyLowStock, search]);

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setSku(item.sku);
    setCategory(item.category);
    setBrand(item.brand);
    setModel(item.model);
    setSpecs(item.specs);
    setCostPrice(String(item.costPrice));
    setSalePrice(String(item.salePrice));
    setStock(String(item.stock));
    setMinStock(String(item.minStock));
    onSetModalOpen(true);
  };

  const handleCloseModal = () => {
    setEditingItem(null);
    setSku('');
    setBrand('');
    setModel('');
    setSpecs('');
    setCostPrice('0');
    setSalePrice('0');
    setStock('1');
    setMinStock('2');
    onSetModalOpen(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const cleanSku = sanitizeSku(sku);
    if (cleanSku.length < 2 || !BLUEPRINT_LIMITS.SKU_PATTERN.test(cleanSku)) {
      notifyError('El SKU debe tener al menos 2 caracteres (letras, números, guion o guion bajo).');
      return;
    }
    const cost = Math.max(0, Number(costPrice) || 0);
    const sale = Math.max(0, Number(salePrice) || 0);
    const qty = Math.max(0, Number(stock) || 0);
    const minQty = Math.max(0, Number(minStock) || 0);

    setSaving(true);
    try {
      if (editingItem) {
        await updateDoc(doc(db, 'inventoryItems', editingItem.id), {
          sku: cleanSku.slice(0, 48),
          category,
          brand: brand.trim().slice(0, 80),
          model: model.trim().slice(0, 120),
          specs: specs.trim().slice(0, BLUEPRINT_LIMITS.MAX_SPECS),
          costPrice: cost,
          salePrice: sale,
          stock: qty,
          minStock: minQty,
          active: true,
          updatedAt: serverTimestamp(),
        });
        notifySuccess(`Artículo ${cleanSku} actualizado.`);
      } else {
        await addDoc(collection(db, 'inventoryItems'), {
          sku: cleanSku.slice(0, 48),
          category,
          brand: brand.trim().slice(0, 80),
          model: model.trim().slice(0, 120),
          specs: specs.trim().slice(0, BLUEPRINT_LIMITS.MAX_SPECS),
          costPrice: cost,
          salePrice: sale,
          stock: qty,
          minStock: minQty,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        notifySuccess(`Artículo ${cleanSku} agregado al catálogo.`);
      }
      handleCloseModal();
    } catch (error) {
      notifyError('No se pudo guardar el artículo en inventario.');
      handleFirestoreError(error, OperationType.WRITE, 'inventoryItems');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!deleteItem || !isAdmin) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'inventoryItems', deleteItem.id));
      if (editingItem?.id === deleteItem.id) {
        handleCloseModal();
      }
      notifySuccess(`Artículo "${deleteItem.brand} ${deleteItem.model}" eliminado.`);
      setDeleteItem(null);
    } catch (error) {
      notifyError('No se pudo eliminar el artículo del inventario.');
      handleFirestoreError(error, OperationType.DELETE, `inventoryItems/${deleteItem.id}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: InventoryCategory.FRAME, label: 'Armazones' },
              { id: InventoryCategory.LENS, label: 'Cristales' },
              { id: InventoryCategory.CONTACT_LENS, label: 'Lentes de contacto' },
              { id: InventoryCategory.ACCESSORY, label: 'Accesorios' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                categoryFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setOnlyLowStock((prev) => !prev)}
            className={`px-3 py-2 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
              onlyLowStock
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            Solo stock bajo
          </button>

          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar SKU, marca o modelo..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-900">No hay artículos en esta vista</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              {isAdmin
                ? 'Agregá armazones, cristales o lentes de contacto para utilizarlos en presupuestos y ventas.'
                : 'Consultá al Administrador para dar de alta nuevos artículos en el catálogo.'}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => onSetModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Agregar artículo
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Marca y modelo</th>
                  <th className="py-3 px-4">Categoría</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Costo</th>}
                  <th className="py-3 px-4 text-right">Precio venta</th>
                  <th className="py-3 px-4 text-right">Stock</th>
                  {isAdmin && <th className="py-3 px-4 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filtered.map((item) => {
                  const low = item.stock <= item.minStock;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {item.sku}
                      </td>
                      <td className="py-3 px-4">
                        <p className="font-medium text-slate-900">
                          {item.brand} {item.model}
                        </p>
                        {item.specs && (
                          <p className="text-xs text-slate-500">{item.specs}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        {INVENTORY_CATEGORY_LABELS[item.category]}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {formatCurrency(item.costPrice)}
                        </td>
                      )}
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-sm font-medium text-slate-900 whitespace-nowrap">
                        {formatCurrency(item.salePrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            item.stock === 0
                              ? 'text-rose-700'
                              : low
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {item.stock} u.
                        </span>
                        <span className="text-slate-400"> / min {item.minStock}</span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-[#0F4C81] rounded-md transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteItem(item)}
                              aria-label="Eliminar artículo"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {editingItem ? 'Editar artículo' : 'Nuevo artículo en inventario'}
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">SKU</label>
                  <input
                    type="text"
                    required
                    maxLength={48}
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="ARM-RAY-5154"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">
                    Categoría
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as InventoryCategory)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {Object.values(InventoryCategory).map((cat) => (
                      <option key={cat} value={cat}>
                        {INVENTORY_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Marca</label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Modelo</label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Especificaciones (calibre, índice, color, curva base)
                </label>
                <input
                  type="text"
                  maxLength={BLUEPRINT_LIMITS.MAX_SPECS}
                  value={specs}
                  onChange={(e) => setSpecs(e.target.value)}
                  placeholder="Ej. Calibre 51-21-145 · Carey"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-[#0F4C81]"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Costo</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Venta</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Stock</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1.5">Mínimo</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#0F4C81] hover:bg-[#0B3A63] disabled:opacity-60 text-white text-sm font-medium rounded-lg cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar artículo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteItem)}
        title="Eliminar artículo de inventario"
        description={
          deleteItem
            ? `Vas a eliminar "${deleteItem.brand} ${deleteItem.model}" (SKU ${deleteItem.sku}) del catálogo. Esta acción no se puede deshacer.`
            : ''
        }
        busy={deleting}
        onCancel={() => !deleting && setDeleteItem(null)}
        onConfirm={handleDeleteItem}
      />
    </div>
  );
}
