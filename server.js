import "dotenv/config"
import express from "express"
import WebSocket from "ws"
import Database from "better-sqlite3"

const app = express()
const PORT = Number(process.env.PORT || 80)
const TOKEN = String(process.env.APISCB_TOKEN || "").trim()
const GAME = "blazdouble"
const WINDOW = Math.min(1000, Math.max(20, Number(process.env.ANALYSIS_WINDOW || 120)))
const PRIOR = Math.max(0, Number(process.env.PRIOR_STRENGTH || 30))
const db = new Database(process.env.DATABASE_PATH || "analise_double.db")
db.pragma("journal_mode = WAL")
db.exec("CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, game TEXT NOT NULL, hora TEXT NOT NULL, numero INTEGER NOT NULL, resultado TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(game,hora,numero))")
db.exec("CREATE INDEX IF NOT EXISTS idx_results_game_id ON results(game,id DESC)")
const save = db.prepare("INSERT OR IGNORE INTO results (game,hora,numero,resultado) VALUES (?,?,?,?)")
const recent = db.prepare("SELECT id,hora,numero,resultado FROM results WHERE game = ? ORDER BY id DESC LIMIT ?")
const total = db.prepare("SELECT COUNT(*) AS n FROM results WHERE game = ?")
let state = TOKEN ? "conectando" : "sem_token"
let lastError = ""
let socket = null

const LABELS = {P:"Preto",V:"Vermelho",B:"Branco"}
const BASE = {P:7/15,V:7/15,B:1/15}
const KEYS = ["P","V","B"]

function category(number) {
  if (!Number.isInteger(number) || number < 0 || number > 14) return null
  if (number === 0) return "B"
  return number <= 7 ? "P" : "V"
}

function estimate(rows) {
  const counts = {P:0,V:0,B:0}
  for (const row of rows) counts[row.resultado]++
  const n = rows.length
  const denom = n + PRIOR
  const rates = Object.fromEntries(KEYS.map(k => [k,denom ? (counts[k] + PRIOR * BASE[k]) / denom : BASE[k]]))
  const sum = KEYS.reduce((a,k) => a + rates[k],0)
  const probability = Object.fromEntries(KEYS.map(k => [k,rates[k]/sum]))
  const ranked = KEYS.slice().sort((a,b) => probability[b] - probability[a] || BASE[b] - BASE[a])
  const tied = ranked.filter(k => Math.abs(probability[k] - probability[ranked[0]]) < 1e-10)
  return {n,counts,rates,probability,mostLikely:tied.length === 1 ? ranked[0] : null,tied,ranked}
}

function backtest(rows) {
  if (rows.length < 31) return {tested:0,hits:0,accuracy:null}
  const ordered = rows.slice().reverse()
  let hits = 0
  let tested = 0
  for (let i=30;i<ordered.length;i++) {
    const sample = ordered.slice(Math.max(0,i-WINDOW),i)
    const result = estimate(sample)
    if (result.mostLikely) {
      tested++
      if (result.mostLikely === ordered[i].resultado) hits++
    }
  }
  return {tested,hits,accuracy:tested ? hits/tested : null}
}

function report() {
  const rows = recent.all(GAME,Math.max(WINDOW,1000))
  const sample = rows.slice(0,WINDOW)
  const prediction = estimate(sample)
  return {game:GAME,status:state,error:lastError,total:total.get(GAME).n,window:WINDOW,priorStrength:PRIOR,baseline:BASE,...prediction,backtest:backtest(rows),latest:rows.slice(0,30),updatedAt:new Date().toISOString(),note:"Poisson de processos concorrentes: a taxa de cada cor é estimada pela frequência suavizada e a chance de ser o próximo evento é lambda_cor / soma(lambda). Resultados independentes não ficam mais prováveis por atraso."}
}

function connect() {
  if (!TOKEN) return
  state = "conectando"
  const url = "wss://apiscb.site/?token=" + encodeURIComponent(TOKEN)
  socket = new WebSocket(url,{handshakeTimeout:15000})
  socket.on("open",() => {state="conectado";lastError=""})
  socket.on("message",data => {
    let msg
    try {msg=JSON.parse(data.toString())} catch {return}
    if (msg.erro) {lastError=String(msg.erro).slice(0,300);state="erro";return}
    if (msg.jogo !== GAME || !msg.novoRegistro) return
    const r=msg.novoRegistro
    const numero=Number(r.numero)
    const color=category(numero)
    if (!color || !r.hora) return
    if (r.resultado && String(r.resultado).trim().toUpperCase() !== color) return
    try {save.run(GAME,String(r.hora),numero,color)} catch(e) {lastError=e.message}
  })
  socket.on("error",e => {lastError=e.message;state="erro"})
  socket.on("close",() => {state="desconectado";setTimeout(connect,5000)})
}

app.use(express.static("public"))
app.get("/api/analysis",(req,res) => {res.set("Cache-Control","no-store");res.json(report())})
app.get("/health",(req,res) => res.json({ok:true,connection:state,game:GAME}))
app.listen(PORT,"0.0.0.0",() => console.log("Analise Double: porta "+PORT))
connect()
process.on("SIGINT",() => {socket?.terminate();db.close();process.exit(0)})
process.on("SIGTERM",() => {socket?.terminate();db.close();process.exit(0)})
