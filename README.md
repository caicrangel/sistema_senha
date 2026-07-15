# Sistema de Senhas — Clínica

Sistema completo de gerenciamento de senhas de atendimento para intranet, com painel de TV com anúncio por voz, totem de autoatendimento, painel do atendente, dashboard, relatórios e configurações.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS 4, servido por Nginx |
| Backend | Node.js 22 + Express + Socket.IO (tempo real) |
| Banco de dados | PostgreSQL 16 (local, em volume Docker) |
| Voz | Web Speech API (voz pt-BR do navegador do monitor — funciona offline) |
| Infra | Docker Compose (3 containers isolados em rede interna) |

## Subindo o sistema

```bash
cp .env.example .env   # ajuste senhas e segredo JWT
docker compose up -d --build
```

Acesse `http://<ip-do-servidor>:8080` (porta configurável via `HTTP_PORT` no `.env`).

**Login inicial:** usuário `admin`, senha `admin123` (defina `ADMIN_USERNAME`/`ADMIN_PASSWORD` no `.env` antes do primeiro boot — troque em produção!).

## Telas

| Rota | Acesso | Descrição |
|---|---|---|
| `/totem` | Público | Totem de autoatendimento: retira senha por tipo (com nome opcional) |
| `/painel` | Público | Painel para TV/monitor: senha chamada em destaque, últimas chamadas, filas e **anúncio por voz** |
| `/login` | Público | Login de atendentes e superusuário |
| `/atendimento` | Atendente | Chamar próxima senha, rechamar, iniciar, finalizar, não compareceu |
| `/senhas` | Atendente | Painel de gestão de senhas do dia (com cancelamento) |
| `/dashboard` | Superusuário | Indicadores do dia em tempo real |
| `/relatorios` | Superusuário | Relatórios por período + exportação CSV |
| `/configuracoes` | Superusuário | Tipos de atendimento (ilimitados), guichês, usuários, aparência e propagandas |

## Como funciona

- **Tipos de atendimento** são configuráveis: nome, prefixo da senha (N, P, E…), prioridade e cor. Os padrões são *Atendimento Normal* (N, prioridade 1) e *Atendimento Preferencial* (P, prioridade 2).
- **Fila por prioridade**: o botão "Chamar próxima" sempre busca a senha de maior prioridade e, em empate, a mais antiga. A numeração reinicia a cada dia, por tipo.
- **Painel com voz**: ao chamar uma senha, o monitor toca um sinal sonoro e fala "Senha N-0-0-1, [nome], Guichê X" com a voz pt-BR do navegador. O som padrão (ligado/desligado) é definido em *Configurações → Painel TV*; o ícone 🔊/🔇 no cabeçalho permite silenciar na hora. A quantidade de "últimas chamadas" exibidas (1 a 10) também é configurável lá.
- **Tempo real**: totem, painel, fila do atendente e dashboard atualizam via WebSocket, sem recarregar a página.
- **Identidade visual**: em *Configurações → Aparência* é possível enviar a logo da empresa, definir o nome e a cor principal de todo o sistema (menu, botões, login e destaques).
- **Temas**: cada usuário escolhe claro/escuro na área interna (botão 🌙/☀️ do menu). O tema do totem e do painel da TV é definido pelo superusuário nas abas *Tela Totem* e *Painel TV*, com atualização ao vivo.
- **Configurações por tela**: as abas de configuração espelham as partes do sistema — Tipos de atendimento, Guichês, Usuários, Tela Totem, Painel TV (tema, som, últimas chamadas e propagandas) e Sistema (identidade da empresa).
- **CRUD completo (somente superusuário)**: tipos, guichês e usuários podem ser criados, editados, desativados e excluídos. Registros com histórico de senhas não podem ser excluídos (o sistema orienta a desativar), e o superusuário não consegue excluir/rebaixar o próprio usuário.
- **Menu recolhível**: o menu lateral pode ser recolhido para mostrar apenas a logo e os ícones.
- **Propagandas na TV**: em *Configurações → Propagandas*, cadastre imagens (campanhas da clínica ou de parceiros) com duração e ordem; elas passam em rodízio ao lado das senhas no painel. Sem propagandas ativas, o painel usa a tela inteira para as chamadas.

## Dicas de implantação na TV / Totem

- Abra o navegador em modo quiosque: `chromium --kiosk http://servidor:8080/painel`
- No Chrome, `chrome://settings` → som permitido para o site evita o clique inicial (ou use a flag `--autoplay-policy=no-user-gesture-required`).
- O totem funciona bem em tablets/telas touch: `chromium --kiosk http://servidor:8080/totem`.

## Desenvolvimento local (sem Docker)

```bash
# Banco: precisa de um PostgreSQL local e DATABASE_URL exportada
cd server && npm install && npm run dev   # API na porta 3000
cd web && npm install && npm run dev      # Vite na porta 5173 (proxy para a API)
```
