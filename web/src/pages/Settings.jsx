import { useEffect, useState } from 'react';
import { api, getUser, downloadFile } from '../lib/api.js';
import { Card, PageTitle, Button, Input, Select } from '../components/ui.jsx';
import { useBranding } from '../lib/branding.jsx';

const TABS = [
  ['types', '🎫 Tipos de atendimento'],
  ['counters', '🪟 Guichês'],
  ['users', '👤 Usuários'],
  ['totem', '🖥️ Tela Totem'],
  ['tv', '📺 Painel TV'],
  ['system', '🏢 Sistema'],
  ['email', '📧 E-mail'],
  ['db', '🗄️ Banco de dados'],
];

// Telas que podem ser liberadas por usuário (Configurações é sempre do superusuário)
const PERM_OPTIONS = [
  ['atendimento', 'Atendimento (chamar senhas)'],
  ['senhas', 'Gestão de Senhas'],
  ['dashboard', 'Dashboard'],
  ['relatorios', 'Relatórios'],
];

export default function Settings() {
  const [tab, setTab] = useState('types');

  return (
    <div>
      <PageTitle
        title="Configurações"
        subtitle="Cada aba concentra o que afeta aquela parte do sistema"
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              tab === key ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'types' && <ServiceTypes />}
      {tab === 'counters' && <Counters />}
      {tab === 'users' && <Users />}
      {tab === 'totem' && <TotemTab />}
      {tab === 'tv' && <PanelTvTab />}
      {tab === 'system' && <SystemTab />}
      {tab === 'email' && <EmailTab />}
      {tab === 'db' && <DatabaseTab />}
    </div>
  );
}

// ---------------------------------------------------------------- E-mail (SMTP + relatórios automáticos)

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const FREQ_LABEL = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' };
const EMPTY_SCHEDULE = {
  name: '', recipients: '', frequency: 'monthly', send_time: '07:00', weekday: 1, monthday: 1,
  subject: 'Relatório de atendimento — {periodo}',
  body: 'Olá,\n\nSegue o relatório de atendimento do período {periodo}.\n\nForam emitidas {total} senhas, com {atendidas} atendimentos concluídos. A espera média foi de {espera_media} e o tempo total de atendimento somou {tempo_total}.\n\nAtenciosamente,\n{empresa}',
  include_summary: true, include_attendants: true, attach_pdf: true, active: true,
};

function EmailTab() {
  return (
    <div className="flex flex-col gap-6">
      <SmtpCard />
      <SchedulesCard />
    </div>
  );
}

function SmtpCard() {
  const [form, setForm] = useState({
    smtp_host: '', smtp_port: '587', smtp_secure: 'tls', smtp_user: '',
    smtp_pass: '', smtp_pass_set: '', smtp_from_name: '', smtp_from_email: '',
  });
  const [testTo, setTestTo] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/admin/settings').then((s) => setForm((p) => ({ ...p, ...s, smtp_pass: '' }))).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true); setMsg(''); setError('');
    try {
      const body = {
        smtp_host: form.smtp_host, smtp_port: form.smtp_port, smtp_secure: form.smtp_secure,
        smtp_user: form.smtp_user, smtp_from_name: form.smtp_from_name, smtp_from_email: form.smtp_from_email,
      };
      if (form.smtp_pass) body.smtp_pass = form.smtp_pass; // em branco = mantém a atual
      const s = await api('/admin/settings', { method: 'PUT', body });
      setForm((p) => ({ ...p, ...s, smtp_pass: '' }));
      setMsg('Configuração SMTP salva.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true); setMsg(''); setError('');
    try {
      await api('/admin/smtp-test', { method: 'POST', body: { to: testTo } });
      setMsg(`E-mail de teste enviado para ${testTo}. Verifique a caixa de entrada.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Servidor de e-mail (SMTP)</h2>
      <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
        Usado para os relatórios automáticos. Ex.: Gmail (smtp.gmail.com, porta 587, TLS, senha de app)
        ou o SMTP do provedor da clínica.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Servidor (host)" placeholder="smtp.provedor.com.br" value={form.smtp_host}
          onChange={(e) => setForm({ ...form, smtp_host: e.target.value })} />
        <Input label="Porta" type="number" value={form.smtp_port}
          onChange={(e) => setForm({ ...form, smtp_port: e.target.value })} />
        <Select label="Segurança" value={form.smtp_secure}
          onChange={(e) => setForm({ ...form, smtp_secure: e.target.value })}>
          <option value="tls">STARTTLS (porta 587)</option>
          <option value="ssl">SSL (porta 465)</option>
          <option value="none">Sem criptografia (rede interna)</option>
        </Select>
        <Input label="Usuário" value={form.smtp_user}
          onChange={(e) => setForm({ ...form, smtp_user: e.target.value })} />
        <Input
          label={form.smtp_pass_set ? 'Senha (definida — deixe em branco para manter)' : 'Senha'}
          type="password" value={form.smtp_pass}
          onChange={(e) => setForm({ ...form, smtp_pass: e.target.value })} />
        <Input label="Nome do remetente" placeholder="Clínica — Senhas" value={form.smtp_from_name}
          onChange={(e) => setForm({ ...form, smtp_from_name: e.target.value })} />
        <Input label="E-mail do remetente" placeholder="nao-responda@clinica.com.br" value={form.smtp_from_email}
          onChange={(e) => setForm({ ...form, smtp_from_email: e.target.value })} />
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Button onClick={save} disabled={busy}>Salvar SMTP</Button>
        <div className="ml-auto flex items-end gap-2">
          <Input label="Enviar teste para" type="email" placeholder="voce@email.com" value={testTo}
            onChange={(e) => setTestTo(e.target.value)} />
          <Button variant="secondary" onClick={test} disabled={busy || !testTo}>✉️ Testar envio</Button>
        </div>
      </div>
      {msg && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{msg}</p>}
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
    </Card>
  );
}

function ScheduleForm({ initial, onSave, onCancel, busy }) {
  const [f, setF] = useState(initial);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Nome do agendamento" placeholder="Ex.: Relatório mensal — gestão" value={f.name}
          onChange={(e) => set('name', e.target.value)} />
        <Input label="Destinatários (separe por vírgula)" placeholder="gestor@clinica.com, diretoria@clinica.com"
          value={f.recipients} onChange={(e) => set('recipients', e.target.value)} />
        <Select label="Periodicidade" value={f.frequency} onChange={(e) => set('frequency', e.target.value)}>
          <option value="daily">Diário (dados do dia anterior)</option>
          <option value="weekly">Semanal (últimos 7 dias)</option>
          <option value="monthly">Mensal (mês anterior)</option>
        </Select>
        <Input label="Horário do envio" type="time" value={f.send_time}
          onChange={(e) => set('send_time', e.target.value)} />
        {f.frequency === 'weekly' && (
          <Select label="Dia da semana" value={f.weekday} onChange={(e) => set('weekday', Number(e.target.value))}>
            {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </Select>
        )}
        {f.frequency === 'monthly' && (
          <Input label="Dia do mês (1 a 28)" type="number" min={1} max={28} value={f.monthday}
            onChange={(e) => set('monthday', Number(e.target.value))} />
        )}
      </div>

      <Input label="Assunto do e-mail" value={f.subject} onChange={(e) => set('subject', e.target.value)} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
          Corpo do e-mail (editável)
        </span>
        <textarea
          rows={6}
          value={f.body}
          onChange={(e) => set('body', e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        />
        <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">
          Variáveis disponíveis: {'{empresa} {periodo} {total} {atendidas} {nao_compareceu} {canceladas} {espera_media} {atendimento_medio} {tempo_total}'}
        </span>
      </label>

      <div className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-200">
        {[
          ['include_summary', 'Incluir resumo do período no corpo'],
          ['include_attendants', 'Incluir performance por atendente'],
          ['attach_pdf', 'Anexar PDF detalhado'],
          ['active', 'Agendamento ativo'],
        ].map(([k, label]) => (
          <label key={k} className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={!!f[k]}
              onChange={(e) => set(k, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onSave(f)} disabled={busy}>{busy ? 'Salvando…' : 'Salvar agendamento'}</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  );
}

function SchedulesCard() {
  const { items, error, setError, load } = useCrud('/admin/email-schedules');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const act = async (fn) => {
    setBusy(true); setMsg(''); setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const create = (f) => act(async () => {
    await api('/admin/email-schedules', { method: 'POST', body: f });
    setCreating(false);
  });
  const update = (id, f) => act(async () => {
    await api(`/admin/email-schedules/${id}`, { method: 'PUT', body: f });
    setEditingId(null);
  });
  const remove = (s) => {
    if (!confirm(`Excluir o agendamento "${s.name}"?`)) return;
    act(() => api(`/admin/email-schedules/${s.id}`, { method: 'DELETE' }));
  };
  const sendNow = (s) => act(async () => {
    await api(`/admin/email-schedules/${s.id}/send-now`, { method: 'POST' });
    setMsg(`"${s.name}" enviado agora para ${s.recipients}.`);
  });

  const when = (s) =>
    s.frequency === 'daily' ? `Diário às ${s.send_time}`
    : s.frequency === 'weekly' ? `${WEEKDAYS[s.weekday]}s às ${s.send_time}`
    : `Todo dia ${s.monthday} às ${s.send_time}`;

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900 dark:text-white">Relatórios automáticos por e-mail</h2>
        {!creating && <Button onClick={() => { setCreating(true); setEditingId(null); }}>➕ Novo agendamento</Button>}
      </div>
      <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
        O servidor dispara sozinho no horário definido: diário envia os dados do dia anterior,
        semanal os últimos 7 dias e mensal o mês anterior fechado.
      </p>

      {creating && (
        <div className="mb-6 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
          <ScheduleForm initial={EMPTY_SCHEDULE} onSave={create} onCancel={() => setCreating(false)} busy={busy} />
        </div>
      )}

      <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((s) =>
          editingId === s.id ? (
            <div key={s.id} className="py-4">
              <ScheduleForm initial={s} onSave={(f) => update(s.id, f)} onCancel={() => setEditingId(null)} busy={busy} />
            </div>
          ) : (
            <div key={s.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className={`font-medium ${s.active ? 'text-slate-900 dark:text-white' : 'text-slate-400 line-through'}`}>
                  {s.name}
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {FREQ_LABEL[s.frequency]}
                  </span>
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {when(s)} · para {s.recipients}
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500">
                  {s.last_sent_at
                    ? `Último envio: ${new Date(s.last_sent_at).toLocaleString('pt-BR')} — ${s.last_status || ''}`
                    : 'Nunca enviado'}
                </div>
              </div>
              <Button variant="secondary" className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => sendNow(s)}>
                📤 Enviar agora
              </Button>
              <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => { setEditingId(s.id); setCreating(false); }}>
                ✏️ Editar
              </Button>
              <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => remove(s)}>
                Excluir
              </Button>
            </div>
          )
        )}
        {items.length === 0 && !creating && (
          <p className="py-6 text-sm text-slate-400 dark:text-slate-500">
            Nenhum agendamento. Clique em "Novo agendamento" para criar, por exemplo, um relatório
            mensal para a gestão.
          </p>
        )}
      </div>
      {msg && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{msg}</p>}
      {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
    </Card>
  );
}

// ---------------------------------------------------------------- Banco de dados

function DatabaseTab() {
  const [stats, setStats] = useState(null);
  const [before, setBefore] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('/admin/db/stats').then(setStats).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const run = async (fn) => {
    setBusy(true);
    setMsg('');
    setError('');
    try {
      await fn();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const clearBefore = () =>
    run(async () => {
      if (!before) throw new Error('Escolha a data limite');
      if (!confirm(`Excluir TODAS as senhas anteriores a ${before.split('-').reverse().join('/')}? Elas saem dos relatórios definitivamente.`)) return;
      const r = await api('/admin/db/clear-tickets', { method: 'POST', body: { before } });
      setMsg(`${r.removed} senha(s) removida(s).`);
    });

  const clearAll = () =>
    run(async () => {
      const typed = prompt('⚠️ Isso apaga TODAS as senhas e zera os relatórios (cadastros, usuários e configurações são mantidos).\n\nDigite LIMPAR para confirmar:');
      if (typed !== 'LIMPAR') {
        if (typed !== null) setError('Confirmação incorreta — nada foi apagado.');
        return;
      }
      const r = await api('/admin/db/clear-tickets', { method: 'POST', body: { all: true } });
      setMsg(`${r.removed} senha(s) removida(s). Banco de senhas zerado.`);
    });

  const backup = () =>
    run(() => downloadFile('/admin/db/export', `backup_senhas_${new Date().toLocaleDateString('en-CA')}.json`));

  const fmtD = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Estado do banco</h2>
        {stats ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Senhas armazenadas', stats.tickets],
              ['Usuários', stats.users],
              ['Tipos de atendimento', stats.service_types],
              ['Guichês', stats.counters],
              ['Propagandas', stats.ads],
              ['Tamanho do banco', stats.db_size],
              ['Senha mais antiga', fmtD(stats.oldest_ticket)],
              ['Senha mais recente', fmtD(stats.newest_ticket)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <div className="text-xs text-slate-500 dark:text-slate-400">{k}</div>
                <div className="font-bold text-slate-900 dark:text-white">{v ?? '—'}</div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Carregando…</p>
        )}
        <div className="mt-4">
          <Button variant="secondary" disabled={busy} onClick={backup}>💾 Baixar backup (JSON)</Button>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Exporta todas as tabelas. Para backup completo do volume, use pg_dump no servidor:
            docker exec senha_db pg_dump -U senhas senhas &gt; backup.sql
          </p>
        </div>
      </Card>

      <Card className="border-red-200 dark:border-red-900/50">
        <h2 className="mb-1 font-semibold text-red-700 dark:text-red-400">Zona de risco — limpeza de senhas</h2>
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Remove senhas do histórico (os relatórios do período apagado zeram). Cadastros,
          usuários, configurações e propagandas nunca são afetados. Faça um backup antes.
        </p>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="mb-2 text-sm font-medium text-slate-900 dark:text-white">
              Limpar senhas antigas
            </div>
            <div className="flex items-end gap-3">
              <Input label="Excluir senhas anteriores a" type="date" value={before}
                onChange={(e) => setBefore(e.target.value)} />
              <Button variant="danger" disabled={busy || !before} onClick={clearBefore}>
                Limpar antigas
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <div className="mb-2 text-sm font-medium text-red-700 dark:text-red-400">
              Limpar TODAS as senhas
            </div>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Zera completamente o histórico de senhas e os relatórios. Pede confirmação digitada.
            </p>
            <Button variant="danger" disabled={busy} onClick={clearAll}>🗑️ Limpar tudo</Button>
          </div>

          {msg && <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{msg}</p>}
          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- utilitários

function useCrud(listPath) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const load = () => api(listPath).then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line
  return { items, error, setError, load };
}

// Formulário de configurações (settings chave/valor) com salvar parcial
function useSettingsForm() {
  const { settings, setSettings } = useBranding();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setForm(settings), [settings]);

  const save = async (keys) => {
    setError('');
    setSaved(false);
    try {
      const body = Object.fromEntries(keys.map((k) => [k, form[k] ?? '']));
      const next = await api('/admin/settings', { method: 'PUT', body });
      setSettings(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message);
    }
  };

  return { form, setForm, save, saved, error };
}

function SaveRow({ onSave, saved, error, label = 'Salvar' }) {
  return (
    <div className="mt-6 flex items-center gap-3">
      <Button onClick={onSave}>{label}</Button>
      {saved && <span className="text-sm font-medium text-emerald-600">✓ Salvo! As telas atualizam sozinhas.</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

// Lê um arquivo de imagem como data URL, redimensionando se necessário
function readImage(file, maxDim, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 500_000) return cb(reader.result);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL('image/png'));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

// ---------------------------------------------------------------- Sistema

function SystemTab() {
  const { form, setForm, save, saved, error } = useSettingsForm();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Identidade da empresa</h2>
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Vale para todo o sistema: menu, login, totem e painel da TV
        </p>
        <div className="flex flex-col gap-4">
          <Input label="Nome da empresa" value={form.company_name || ''}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })} />

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Logo</span>
            <div className="flex items-center gap-4">
              {form.logo ? (
                <img src={form.logo} alt="Logo" className="h-16 w-16 rounded-xl border border-slate-200 object-contain p-1 dark:border-slate-700" />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-400 dark:border-slate-600">
                  sem logo
                </div>
              )}
              <label className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                Enviar imagem
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) readImage(f, 512, (dataUrl) => setForm((p) => ({ ...p, logo: dataUrl })));
                  }} />
              </label>
              {form.logo && (
                <Button variant="secondary" onClick={() => setForm({ ...form, logo: '' })}>Remover</Button>
              )}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Cor principal do sistema
            </span>
            <div className="flex items-center gap-3">
              <input type="color" value={form.brand_color || '#2563eb'}
                onChange={(e) => setForm({ ...form, brand_color: e.target.value })}
                className="h-10 w-24 cursor-pointer rounded-xl border border-slate-300 dark:border-slate-600" />
              <span className="text-sm tabular-nums text-slate-500 dark:text-slate-400">{form.brand_color}</span>
            </div>
          </div>
        </div>
        <SaveRow onSave={() => save(['company_name', 'logo', 'brand_color'])} saved={saved} error={error} label="Salvar identidade" />
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Tema da área interna</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          O tema claro/escuro da área interna é uma preferência individual: cada usuário escolhe
          no botão 🌙/☀️ do menu lateral e fica salvo no navegador da estação dele.
          Os temas do Totem e do Painel TV ficam nas abas específicas dessas telas.
        </p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Tela Totem

function TotemTab() {
  const { form, setForm, save, saved, error } = useSettingsForm();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Tela Totem</h2>
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Comportamento da tela pública de retirada de senhas (/totem)
        </p>
        <div className="flex flex-col gap-4">
          <Select label="Tema" value={form.totem_theme || 'dark'}
            onChange={(e) => setForm({ ...form, totem_theme: e.target.value })}>
            <option value="dark">Escuro</option>
            <option value="light">Claro</option>
          </Select>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Os botões de atendimento exibidos no totem são os tipos ativos da aba
            "Tipos de atendimento", com as cores definidas lá.
          </p>
        </div>
        <SaveRow onSave={() => save(['totem_theme'])} saved={saved} error={error} label="Salvar Totem" />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Painel TV

function PanelTvTab() {
  const { form, setForm, save, saved, error } = useSettingsForm();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Painel TV</h2>
          <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
            Comportamento da tela pública do monitor (/painel)
          </p>
          <div className="flex flex-col gap-4">
            <Select label="Tema" value={form.panel_theme || 'dark'}
              onChange={(e) => setForm({ ...form, panel_theme: e.target.value })}>
              <option value="dark">Escuro</option>
              <option value="light">Claro</option>
            </Select>
            <Select label="Som ao abrir o painel" value={form.panel_sound || 'on'}
              onChange={(e) => setForm({ ...form, panel_sound: e.target.value })}>
              <option value="on">Ligado — anuncia com voz e sinal sonoro</option>
              <option value="off">Desligado — painel silencioso</option>
            </Select>
            <Input label="Quantidade de últimas chamadas exibidas (1 a 10)" type="number" min={1} max={10}
              value={form.panel_last_calls || 5}
              onChange={(e) => setForm({ ...form, panel_last_calls: e.target.value })} />
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Navegadores podem exigir um clique na página antes de liberar o áudio. Para a TV
              em modo quiosque, abra o Chrome/Chromium com a opção
              --autoplay-policy=no-user-gesture-required para o som funcionar direto.
              O ícone 🔊/🔇 no cabeçalho do painel permite silenciar na hora, sem mudar esta configuração.
            </p>
          </div>
          <SaveRow onSave={() => save(['panel_theme', 'panel_sound', 'panel_last_calls'])} saved={saved} error={error} label="Salvar Painel TV" />
        </Card>
      </div>

      <Ads />
    </div>
  );
}

// ---------------------------------------------------------------- Propagandas (parte do Painel TV)

function Ads() {
  const { items, error, setError, load } = useCrud('/admin/ads');
  const [form, setForm] = useState({ title: '', image: '', duration_sec: 10, sort_order: 0 });
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.image) return setError('Selecione uma imagem');
    setBusy(true);
    try {
      await api('/admin/ads', { method: 'POST', body: form });
      setForm({ title: '', image: '', duration_sec: 10, sort_order: 0 });
      load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (ad) => {
    await api(`/admin/ads/${ad.id}`, { method: 'PUT', body: { active: !ad.active } });
    load();
  };

  const remove = async (ad) => {
    if (!confirm(`Excluir a propaganda "${ad.title}"?`)) return;
    await api(`/admin/ads/${ad.id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Nova propaganda</h2>
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Exibidas em rodízio no Painel TV, ao lado das senhas
        </p>
        <form onSubmit={create} className="flex flex-col gap-3">
          <Input label="Título (uso interno)" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} required />

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Imagem (aparece na TV)
            </span>
            {form.image && (
              <img src={form.image} alt="Prévia" className="mb-2 max-h-40 w-full rounded-xl object-contain" />
            )}
            <label className="block cursor-pointer rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800">
              {form.image ? 'Trocar imagem' : 'Clique para escolher a imagem'}
              <input type="file" accept="image/*" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readImage(f, 1920, (dataUrl) => setForm((p) => ({ ...p, image: dataUrl })));
                }} />
            </label>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Ideal: 1080×1920 (vertical) ou 1920×1080 (horizontal), até 3 MB
            </p>
          </div>

          <Input label="Duração na tela (segundos)" type="number" min={3} max={120} value={form.duration_sec}
            onChange={(e) => setForm({ ...form, duration_sec: Number(e.target.value) })} />
          <Input label="Ordem de exibição" type="number" value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />

          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Adicionar propaganda'}</Button>
        </form>
      </Card>

      <Card className="lg:col-span-2">
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Propagandas cadastradas</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((ad) => (
            <div key={ad.id} className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
              <img src={ad.image} alt={ad.title} className={`h-36 w-full object-cover ${ad.active ? '' : 'opacity-40 grayscale'}`} />
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className={`truncate text-sm font-medium ${ad.active ? 'text-slate-900 dark:text-white' : 'text-slate-400 line-through'}`}>
                    {ad.title}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">
                    {ad.duration_sec}s · ordem {ad.sort_order}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant={ad.active ? 'secondary' : 'success'} className="px-2.5 py-1 text-xs" onClick={() => toggle(ad)}>
                    {ad.active ? 'Pausar' : 'Ativar'}
                  </Button>
                  <Button variant="danger" className="px-2.5 py-1 text-xs" onClick={() => remove(ad)}>
                    Excluir
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">
              Nenhuma propaganda cadastrada. Sem propagandas ativas, a TV usa a tela inteira para as senhas.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- Tipos de atendimento

function ServiceTypes() {
  const { items, error, setError, load } = useCrud('/admin/service-types?all=1');
  const [form, setForm] = useState({ name: '', prefix: '', priority: 1, color: '#2a78d6' });

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/service-types', { method: 'POST', body: form });
      setForm({ name: '', prefix: '', priority: 1, color: '#2a78d6' });
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  const toggle = async (t) => {
    await api(`/admin/service-types/${t.id}`, { method: 'PUT', body: { active: !t.active } });
    load();
  };

  const remove = async (t) => {
    if (!confirm(`Excluir o tipo "${t.name}"? Só é possível se não houver senhas no histórico.`)) return;
    try {
      await api(`/admin/service-types/${t.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Novo tipo de atendimento</h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          <Input label="Nome" placeholder="Ex.: Exames" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Prefixo da senha (1–3 letras)" placeholder="Ex.: E" maxLength={3} value={form.prefix}
            onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} required />
          <Input label="Prioridade (maior = chamado antes)" type="number" min={1} max={10} value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Cor</span>
            <input type="color" value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-10 w-full cursor-pointer rounded-xl border border-slate-300 dark:border-slate-600" />
          </label>
          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit">Criar tipo</Button>
        </form>
      </Card>

      <Card className="lg:col-span-2">
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Tipos cadastrados</h2>
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Regra da fila: chama sempre a maior prioridade; empate é decidido pela ordem de chegada
        </p>
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((t) => (
            <ServiceTypeRow key={t.id} type={t} onToggle={toggle} onDelete={remove} onSaved={load} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function ServiceTypeRow({ type: t, onToggle, onDelete, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: t.name, prefix: t.prefix, priority: t.priority, color: t.color });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      await api(`/admin/service-types/${t.id}`, { method: 'PUT', body: form });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-3 py-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Nome" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Prefixo" maxLength={3} value={form.prefix}
            onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} />
          <Input label="Prioridade" type="number" min={1} max={10} value={form.priority}
            onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Cor</span>
            <input type="color" value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-9 w-full cursor-pointer rounded-xl border border-slate-300 dark:border-slate-600" />
          </label>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Alterar o prefixo vale apenas para senhas novas; as já emitidas mantêm o código original.
        </p>
        {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={save} disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</Button>
          <Button variant="secondary" onClick={() => { setEditing(false); setError(''); setForm({ name: t.name, prefix: t.prefix, priority: t.priority, color: t.color }); }}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <span className="grid h-10 w-14 place-items-center rounded-lg font-black text-white"
        style={{ backgroundColor: t.color }}>
        {t.prefix}
      </span>
      <div className="flex-1">
        <div className={`font-medium ${t.active ? 'text-slate-900 dark:text-white' : 'text-slate-400 line-through'}`}>
          {t.name}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Prioridade {t.priority}</div>
      </div>
      <Button variant="secondary" onClick={() => setEditing(true)}>✏️ Editar</Button>
      <Button variant={t.active ? 'secondary' : 'success'} onClick={() => onToggle(t)}>
        {t.active ? 'Desativar' : 'Ativar'}
      </Button>
      <Button variant="danger" onClick={() => onDelete(t)}>Excluir</Button>
    </div>
  );
}

// ---------------------------------------------------------------- Guichês

function Counters() {
  const { items, error, setError, load } = useCrud('/admin/counters');
  const [name, setName] = useState('');

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/counters', { method: 'POST', body: { name } });
      setName('');
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Novo guichê</h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          <Input label="Nome" placeholder="Ex.: Guichê 3" value={name}
            onChange={(e) => setName(e.target.value)} required />
          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit">Criar guichê</Button>
        </form>
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Guichês cadastrados</h2>
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((c) => (
            <CounterRow key={c.id} counter={c} onSaved={load} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function CounterRow({ counter: c, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    try {
      await api(`/admin/counters/${c.id}`, { method: 'PUT', body: { name } });
      setEditing(false);
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggle = async () => {
    await api(`/admin/counters/${c.id}`, { method: 'PUT', body: { active: !c.active } });
    onSaved();
  };

  const remove = async () => {
    if (!confirm(`Excluir o guichê "${c.name}"? Só é possível se não houver senhas no histórico.`)) return;
    try {
      await api(`/admin/counters/${c.id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      alert(e.message);
    }
  };

  if (editing) {
    return (
      <div className="flex items-end gap-3 py-3">
        <div className="flex-1">
          <Input label="Nome do guichê" value={name} onChange={(e) => setName(e.target.value)} />
          {error && <p className="mt-2 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        </div>
        <Button onClick={save}>Salvar</Button>
        <Button variant="secondary" onClick={() => { setEditing(false); setName(c.name); setError(''); }}>Cancelar</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <span className={`flex-1 ${c.active ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-400 line-through'}`}>
        {c.name}
      </span>
      <Button variant="secondary" onClick={() => setEditing(true)}>✏️ Editar</Button>
      <Button variant={c.active ? 'secondary' : 'success'} onClick={toggle}>
        {c.active ? 'Desativar' : 'Ativar'}
      </Button>
      <Button variant="danger" onClick={remove}>Excluir</Button>
    </div>
  );
}

// ---------------------------------------------------------------- Usuários

// Checkboxes de acesso por tela
function PermissionPicker({ value, onChange, disabled }) {
  const toggle = (perm) =>
    onChange(value.includes(perm) ? value.filter((p) => p !== perm) : [...value, perm]);

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        Telas que pode acessar
      </span>
      <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        {PERM_OPTIONS.map(([perm, label]) => (
          <label key={perm} className={`flex items-center gap-2 text-sm ${disabled ? 'opacity-50' : 'cursor-pointer'} text-slate-700 dark:text-slate-200`}>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--brand)]"
              checked={disabled || value.includes(perm)}
              disabled={disabled}
              onChange={() => toggle(perm)}
            />
            {label}
          </label>
        ))}
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          {disabled
            ? 'Superusuário acessa todas as telas, incluindo Configurações.'
            : 'Configurações é sempre exclusiva do superusuário.'}
        </p>
      </div>
    </div>
  );
}

function Users() {
  const { items, error, setError, load } = useCrud('/admin/users');
  const [form, setForm] = useState({
    name: '', username: '', password: '', role: 'attendant',
    permissions: ['atendimento', 'senhas'],
  });

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/admin/users', { method: 'POST', body: form });
      setForm({ name: '', username: '', password: '', role: 'attendant', permissions: ['atendimento', 'senhas'] });
      load();
    } catch (e2) {
      setError(e2.message);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card>
        <h2 className="mb-4 font-semibold text-slate-900 dark:text-white">Novo usuário</h2>
        <form onSubmit={create} className="flex flex-col gap-3">
          <Input label="Nome completo" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Usuário (login)" value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          <Input label="Senha" type="password" minLength={6} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Select label="Perfil" value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="attendant">Atendente</option>
            <option value="admin">Superusuário</option>
          </Select>
          <PermissionPicker
            value={form.permissions}
            disabled={form.role === 'admin'}
            onChange={(permissions) => setForm({ ...form, permissions })}
          />
          {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit">Criar usuário</Button>
        </form>
      </Card>
      <Card className="lg:col-span-2">
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-white">Usuários cadastrados</h2>
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          O login (usuário) não muda após a criação; nome, perfil e senha podem ser editados
        </p>
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((u) => (
            <UserRow key={u.id} user={u} onSaved={load} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function UserRow({ user: u, onSaved }) {
  const me = getUser();
  const isSelf = me?.id === u.id;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: u.name, role: u.role, password: '', permissions: u.permissions || [],
  });
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    try {
      const body = { name: form.name, role: form.role, permissions: form.permissions };
      if (form.password) body.password = form.password;
      await api(`/admin/users/${u.id}`, { method: 'PUT', body });
      setEditing(false);
      setForm((p) => ({ ...p, password: '' }));
      onSaved();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggle = async () => {
    await api(`/admin/users/${u.id}`, { method: 'PUT', body: { active: !u.active } });
    onSaved();
  };

  const remove = async () => {
    if (!confirm(`Excluir o usuário "${u.name}"? Só é possível se não houver atendimentos no histórico.`)) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      onSaved();
    } catch (e) {
      alert(e.message);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-3 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Nome" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Perfil" value={form.role} disabled={isSelf}
            onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="attendant">Atendente</option>
            <option value="admin">Superusuário</option>
          </Select>
          <Input label="Nova senha (deixe vazio para manter)" type="password" minLength={6} value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <PermissionPicker
          value={form.permissions}
          disabled={form.role === 'admin'}
          onChange={(permissions) => setForm({ ...form, permissions })}
        />
        {isSelf && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Você não pode alterar o próprio perfil (evita ficar sem superusuário).
          </p>
        )}
        {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={save}>Salvar alterações</Button>
          <Button variant="secondary" onClick={() => { setEditing(false); setError(''); setForm({ name: u.name, role: u.role, password: '' }); }}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex-1">
        <div className={`font-medium ${u.active ? 'text-slate-900 dark:text-white' : 'text-slate-400 line-through'}`}>
          {u.name}
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {u.role === 'admin' ? 'Superusuário' : 'Atendente'}
          </span>
          {isSelf && <span className="ml-2 text-xs text-slate-400">(você)</span>}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          @{u.username}
          {u.role !== 'admin' && (
            <span className="ml-2">
              · Acessa: {(u.permissions || []).length
                ? PERM_OPTIONS.filter(([p]) => u.permissions.includes(p)).map(([, l]) => l.split(' (')[0]).join(', ')
                : 'nenhuma tela'}
            </span>
          )}
        </div>
      </div>
      <Button variant="secondary" onClick={() => setEditing(true)}>✏️ Editar</Button>
      {!isSelf && (
        <>
          <Button variant={u.active ? 'secondary' : 'success'} onClick={toggle}>
            {u.active ? 'Desativar' : 'Ativar'}
          </Button>
          <Button variant="danger" onClick={remove}>Excluir</Button>
        </>
      )}
    </div>
  );
}
