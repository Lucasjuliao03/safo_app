import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAdminPlans, useCreatePlan, useUpdatePlan } from "@/hooks/useAdminData";
import { CreditCard, Edit2, Check, X, ShieldAlert, Plus, Archive, ArchiveRestore } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminPlans() {
  const { data: plans = [], isLoading } = useAdminPlans();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    price_cents: 0,
    duration_days: 0,
    is_active: true
  });
  const [isCreating, setIsCreating] = useState(false);

  const handleEdit = (plan: any) => {
    setEditingPlanId(plan.id);
    setFormData({
      code: plan.code,
      name: plan.name,
      description: plan.description || "",
      price_cents: plan.price_cents,
      duration_days: plan.duration_days,
      is_active: plan.is_active
    });
    setIsCreating(false);
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setEditingPlanId(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      price_cents: 0,
      duration_days: 30,
      is_active: true
    });
  };

  const handleSave = () => {
    if (isCreating) {
      if (!formData.code || !formData.name) {
        alert("Preencha ao menos o Código e o Nome do plano.");
        return;
      }
      createPlan.mutate(formData, {
        onSuccess: () => {
          setIsCreating(false);
        }
      });
    } else if (editingPlanId) {
      updatePlan.mutate({ id: editingPlanId, data: formData }, {
        onSuccess: () => {
          setEditingPlanId(null);
        }
      });
    }
  };

  const handleToggleActive = (id: string, currentStatus: boolean) => {
    if (!confirm(`Deseja realmente ${currentStatus ? 'desativar' : 'reativar'} esse plano?`)) return;
    updatePlan.mutate({ id, data: { is_active: !currentStatus } });
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const cancelEdit = () => {
    setEditingPlanId(null);
    setIsCreating(false);
  };

  const renderForm = () => (
     <div className="rounded-2xl border border-border bg-card p-4 space-y-4 animate-fade-in mb-6">
        <h3 className="font-semibold">{isCreating ? "Novo Plano" : "Editar Plano"}</h3>
        <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Código (ex: monthly_pro)</label>
                <input 
                   disabled={!isCreating}
                   placeholder="Código único"
                   value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} 
                   className="w-full rounded-xl border px-3 py-2 text-sm bg-background disabled:opacity-50"
                />
            </div>
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nome (Público)</label>
                <input 
                   placeholder="Ex: Plano Anual"
                   value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} 
                   className="w-full rounded-xl border px-3 py-2 text-sm bg-background"
                />
            </div>
            <div className="space-y-1 col-span-2">
                <label className="text-xs text-muted-foreground">Descrição (Benefícios)</label>
                 <textarea 
                   rows={2}
                   value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} 
                   className="w-full rounded-xl border px-3 py-2 text-sm bg-background"
                />
            </div>
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Preço em Centavos (ex: 2990 = R$ 29,90)</label>
                <input 
                   type="number"
                   value={formData.price_cents} onChange={e => setFormData({ ...formData, price_cents: parseInt(e.target.value) || 0 })} 
                   className="w-full rounded-xl border px-3 py-2 text-sm bg-background"
                />
                <p className="text-[10px] text-primary font-semibold mt-1">Preço final de venda: {formatPrice(formData.price_cents)}</p>
            </div>
            <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Duração em Dias (Acesso)</label>
                <input 
                   type="number"
                   value={formData.duration_days} onChange={e => setFormData({ ...formData, duration_days: parseInt(e.target.value) || 0 })} 
                   className="w-full rounded-xl border px-3 py-2 text-sm bg-background"
                />
            </div>
            <div className="space-y-1 flex flex-col justify-end">
               <label className="flex items-center gap-2 text-sm cursor-pointer border p-2 rounded-xl bg-background">
                   <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="accent-primary w-4 h-4" />
                   Plano Ativo (Visível para compra)
               </label>
            </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
            <button onClick={cancelEdit} className="px-4 py-2 text-sm border rounded-xl hover:bg-muted font-medium">Cancelar</button>
            <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary text-primary-foreground font-semibold rounded-xl active:scale-[0.98]">
               {(createPlan.isPending || updatePlan.isPending) ? "Salvando..." : <><Check className="w-4 h-4"/> Salvar</>}
            </button>
        </div>
     </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Planos de Assinatura</h2>
            <p className="text-xs text-muted-foreground">Gerencie assinaturas. Adicione novos e arquive antigos.</p>
          </div>
          <button 
             onClick={handleCreateNew}
             disabled={isCreating}
             className="bg-primary/10 text-primary border border-primary/20 px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-all hover:bg-primary/20 disabled:opacity-50">
              <Plus className="w-4 h-4" /> Novo Plano
          </button>
      </div>

      {(isCreating || editingPlanId) && renderForm()}

      {isLoading ? (
          <div className="text-center text-muted-foreground p-8">Carregando planos...</div>
      ) : plans.length === 0 ? (
          <div className="text-center p-8 bg-muted rounded-2xl border text-muted-foreground">Nenhum plano encontrado.</div>
      ) : (
          <div className="grid gap-3">
              {plans.map(p => (
                  <div key={p.id} className={cn("p-4 rounded-2xl border flex items-center justify-between transition-colors", p.is_active ? "bg-card border-border" : "bg-muted/50 border-border/50")}>
                      <div className="flex-1">
                          <div className="flex gap-2 items-center">
                             <h4 className="font-semibold text-sm">{p.name}</h4>
                             <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-full border", p.is_active ? "bg-success/15 border-success/30 text-success" : "bg-warning/15 border-warning/30 text-warning")}>
                                 {p.is_active ? "Ativo" : "Arquivado"}
                             </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1"><span className="font-mono">{p.code}</span> • {p.duration_days} dias</p>
                          <p className="font-black text-primary">{formatPrice(p.price_cents)}</p>
                      </div>
                      <div className="flex gap-2">
                           <button onClick={() => handleEdit(p)} className="p-2 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80">
                               <Edit2 className="w-4 h-4" />
                           </button>
                           <button onClick={() => handleToggleActive(p.id, p.is_active)} className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 border border-destructive/20" title={p.is_active ? "Arquivar plano" : "Reativar"}>
                               {p.is_active ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
                           </button>
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
}
