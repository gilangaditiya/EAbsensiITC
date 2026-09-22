/* E-ABSENSI ITC SMK GANESA - REBUILD */

const SUPABASE_URL = "https://gltcygellftrfnovmlep.supabase.co";
const SUPABASE_KEY = "sb_publishable_bLQxEyQwnJyUANs-PPhyiw_0lzXkbZt";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentMode = null;
let currentUser = null;
let currentPetugas = null;
let currentPage = "modePage";
let anggotaData = [];
let selectedQRMember = null;
let selectedManualMember = null;
let qrScanner = null;
let toastTimer = null;
let realtimeChannel = null;
let navigationStack = [];
let isPopStateNavigation = false;
let attendanceLocks = new Map();

const $ = id => document.getElementById(id);

const pages = [
  "modePage","loginPage","anggotaHomePage","dashboardPage",
  "anggotaPage","qrPage","scannerPage","manualAbsensiPage","rekapPage","pengumumanPage"
];

function showPage(id,{pushHistory=true}={}){
  if(!$(id)) return;
  pages.forEach(p => $(p)?.classList.remove("active"));
  $(id)?.classList.add("active");
  if(pushHistory && !isPopStateNavigation && currentPage !== id){
    navigationStack.push(currentPage);
    history.pushState({page:id}, "", `#${id}`);
  }
  currentPage = id;
  window.scrollTo({top:0,behavior:"auto"});
}

function goBack(){
  if(navigationStack.length){
    history.back();
    return true;
  }
  return false;
}

function resetNavigation(page="modePage"){
  navigationStack=[];
  history.replaceState({page}, "", `#${page}`);
}

function escapeHTML(v){
  return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function getInitials(name){
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if(!words.length) return "--";
  if(words.length === 1) return words[0].slice(0,2).toUpperCase();
  return (words[0][0] + words[words.length-1][0]).toUpperCase();
}

function getToday(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getCurrentTime(){
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
}

function formatTanggal(v){
  if(!v) return "-";
  const d = new Date(v+"T00:00:00");
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("id-ID",{day:"2-digit",month:"2-digit",year:"numeric"});
}

function statusLabel(s){
  return ({hadir:"Hadir",sakit:"Sakit",izin:"Izin","tanpa keterangan":"Tanpa Keterangan"})[s] || s || "-";
}
function statusClass(s){
  return ({hadir:"status-hadir",sakit:"status-sakit",izin:"status-izin","tanpa keterangan":"status-tanpa"})[s] || "";
}

function toast(message,type=""){
  const el=$("toast"); if(!el) return;
  clearTimeout(toastTimer);
  el.textContent=message;
  el.className="toast show "+type;
  toastTimer=setTimeout(()=>el.className="toast",2600);
}

function message(id,text,type=""){
  const el=$(id); if(!el) return;
  el.textContent=text || "";
  el.className="message "+type;
}

function setLoadingButton(btn,loadingText,loading){
  if(!btn) return;
  if(loading){
    btn.dataset.originalText=btn.textContent;
    btn.disabled=true;
    btn.textContent=loadingText;
  }else{
    btn.disabled=false;
    btn.textContent=btn.dataset.originalText || btn.textContent;
  }
}

function setMode(mode){
  currentMode=mode;
  document.body.dataset.mode=mode || "";
}

function backToMode(){
  stopScanner();
  setMode(null);
  currentUser=null;
  currentPetugas=null;
  selectedManualMember=null;
  selectedQRMember=null;
  resetNavigation("modePage");
  showPage("modePage",{pushHistory:false});
}

async function getPetugas(){
  if(!currentUser) return null;
  const {data,error}=await supabaseClient.from("Petugas").select("*").eq("id",currentUser.id).maybeSingle();
  if(error) throw error;
  currentPetugas=data;
  return data;
}

/* ---------- AUTH ---------- */
$("pengelolaModeButton").addEventListener("click",()=>{setMode("pengelola");showPage("loginPage")});
$("anggotaModeButton").addEventListener("click",()=>{setMode("anggota");showPage("anggotaHomePage")});
$("backToModeFromLogin").addEventListener("click",backToMode);
$("keluarModeAnggota").addEventListener("click",backToMode);
$("headerHomeButton").addEventListener("click",()=>{
  if(currentMode==="pengelola" && currentUser) showPage("dashboardPage");
  else if(currentMode==="anggota") showPage("anggotaHomePage");
  else showPage("modePage");
});

$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const email=$("email").value.trim(), password=$("password").value;
  if(!email||!password){message("loginMessage","Email dan password wajib diisi.","error");return}
  setLoadingButton($("loginButton"),"Memproses...",true); message("loginMessage","");
  try{
    const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});
    if(error) throw error;
    currentUser=data.user;
    const petugas=await getPetugas();
    if(!petugas){
      await supabaseClient.auth.signOut();
      currentUser=null;
      throw new Error("Akun ini tidak terdaftar sebagai petugas.");
    }
    setMode("pengelola");
    $("loginForm").reset();
    showPage("dashboardPage");
    await loadDashboard();
    toast("Login berhasil.","success");
  }catch(err){console.error(err);message("loginMessage",err.message||"Login gagal.","error")}
  finally{setLoadingButton($("loginButton"),"",false)}
});

$("logoutButton").addEventListener("click",async()=>{
  try{await supabaseClient.auth.signOut()}catch(e){console.error(e)}
  stopScanner(); currentUser=null; currentPetugas=null; setMode(null); showPage("modePage"); toast("Berhasil keluar.","success");
});

/* ---------- DASHBOARD ---------- */
async function loadDashboard(){
  try{
    const {count:memberCount,error:memberError}=await supabaseClient.from("Anggota").select("*",{count:"exact",head:true});
    if(memberError) throw memberError;
    const {count:attendanceCount,error:attendanceError}=await supabaseClient.from("Absensi").select("*",{count:"exact",head:true}).eq("tanggal",getToday());
    if(attendanceError) throw attendanceError;
    $("totalAnggota").textContent=memberCount ?? 0;
    $("totalKehadiran").textContent=attendanceCount ?? 0;
  }catch(e){console.error(e);toast("Gagal memuat statistik.","error")}
}

$("anggotaButton").addEventListener("click",async()=>{showPage("anggotaPage");await loadAnggota()});
$("backFromAnggota").addEventListener("click",async()=>{if(!goBack())showPage(currentMode==="anggota"?"anggotaHomePage":"dashboardPage",{pushHistory:false});if(currentMode==="pengelola"&&currentPage==="dashboardPage")await loadDashboard()});
$("scanQRButton").addEventListener("click",async()=>{showPage("scannerPage");await startScanner();await loadScannerMembers()});
$("manualAbsensiButton").addEventListener("click",async()=>{
  resetManual();
  $("manualAbsensiSearch").value="";
  showPage("manualAbsensiPage");
  await loadManualMembers("");
});
$("rekapButton").addEventListener("click",async()=>{ $("rekapTanggal").value=getToday();showPage("rekapPage");await loadRekap()});

$("pengumumanButton").addEventListener("click",async()=>{showPage("pengumumanPage");await loadPengumuman()});

/* ---------- ANGGOTA ---------- */
async function loadAnggota(search=""){
  const list=$("anggotaList"), empty=$("anggotaEmptyState");
  list.innerHTML="";
  try{
    let q=supabaseClient.from("Anggota").select("*").order("nama",{ascending:true});
    if(search.trim()) q=q.or(`nama.ilike.%${search.trim()}%,kelas.ilike.%${search.trim()}%`);
    const {data,error}=await q;
    if(error) throw error;
    anggotaData=data||[];
    $("jumlahAnggota").textContent=anggotaData.length;
    empty.classList.toggle("hidden",anggotaData.length>0);
    renderAnggota(anggotaData);
  }catch(e){console.error(e);toast("Gagal memuat data anggota.","error")}
}

function renderAnggota(data){
  const list=$("anggotaList"); list.innerHTML="";
  data.forEach(m=>{
    const card=document.createElement("article");
    card.className="member-card";
    const active=(m.status||"aktif")==="aktif";
    const canManage=currentMode==="pengelola";
    card.innerHTML=`
      <div class="avatar">${escapeHTML(getInitials(m.nama))}</div>
      <div class="member-info">
        <strong>${escapeHTML(m.nama||"-")}</strong>
        <span>${escapeHTML(m.kelas||"-")}</span>
        <small>Bergabung: ${escapeHTML(formatTanggal(m.tanggal_bergabung))}</small>
      </div>
      <div class="member-meta">
        <span class="status-pill ${active?"status-active":"status-inactive"}">${active?"Aktif":"Nonaktif"}</span>
        <div class="member-actions">
          <button class="mini-button" data-action="qr" data-id="${escapeHTML(m.id)}" type="button">QR</button>
          ${canManage?`<button class="mini-button" data-action="edit" data-id="${escapeHTML(m.id)}" type="button">Edit</button><button class="mini-button danger" data-action="delete" data-id="${escapeHTML(m.id)}" type="button">Hapus</button>`:""}
        </div>
      </div>`;
    list.appendChild(card);
  });
}

$("searchAnggota").addEventListener("input",e=>loadAnggota(e.target.value));
$("anggotaList").addEventListener("click",async e=>{
  const b=e.target.closest("[data-action]"); if(!b)return;
  const id=b.dataset.id;
  if(b.dataset.action==="qr") await openQR(id);
  if(b.dataset.action==="edit") openEdit(id);
  if(b.dataset.action==="delete") await deleteMember(id);
});

$("tambahAnggotaButton").addEventListener("click",()=>{
  if(currentMode!=="pengelola")return;
  $("formAnggota").reset(); $("tanggalBergabung").value=getToday(); $("statusAnggota").value="aktif";
  $("tambahAnggotaForm").classList.remove("hidden"); $("formEditAnggota").classList.add("hidden");
  $("tambahAnggotaForm").scrollIntoView({behavior:"smooth",block:"start"});
});
$("batalTambahAnggota").addEventListener("click",()=>{$("tambahAnggotaForm").classList.add("hidden");$("formAnggota").reset()});
$("batalEditAnggota").addEventListener("click",()=>{$("formEditAnggota").classList.add("hidden")});

$("formAnggota").addEventListener("submit",async e=>{
  e.preventDefault(); if(currentMode!=="pengelola")return;
  const nama=$("namaAnggota").value.trim(), kelas=$("kelasAnggota").value.trim(), tanggal=$("tanggalBergabung").value, status=$("statusAnggota").value;
  if(!nama||!kelas||!tanggal){message("anggotaMessage","Lengkapi data anggota.","error");return}
  const btn=e.target.querySelector("button[type=submit]"); setLoadingButton(btn,"Menyimpan...",true);
  try{
    const {data,error}=await supabaseClient.from("Anggota").insert({nama,kelas,tanggal_bergabung:tanggal,status}).select().single();
    if(error) throw error;
    if(data?.id){
      const {error:qrErr}=await supabaseClient.from("Anggota").update({qr_code:data.id}).eq("id",data.id);
      if(qrErr) console.warn("QR code update:",qrErr);
    }
    $("formAnggota").reset();$("tanggalBergabung").value=getToday();$("statusAnggota").value="aktif";$("tambahAnggotaForm").classList.add("hidden");
    await loadAnggota();await loadDashboard();toast("Anggota berhasil ditambahkan.","success");
  }catch(err){console.error(err);message("anggotaMessage",err.message||"Gagal menambah anggota.","error")}
  finally{setLoadingButton(btn,"",false)}
});

function openEdit(id){
  const m=anggotaData.find(x=>x.id===id); if(!m)return;
  $("editId").value=m.id;$("editNama").value=m.nama||"";$("editKelas").value=m.kelas||"";$("editTanggal").value=m.tanggal_bergabung||getToday();$("editStatus").value=m.status||"aktif";
  $("formEditAnggota").classList.remove("hidden");$("tambahAnggotaForm").classList.add("hidden");
  $("formEditAnggota").scrollIntoView({behavior:"smooth",block:"start"});
}

$("editForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("editId").value;
  const payload={nama:$("editNama").value.trim(),kelas:$("editKelas").value.trim(),tanggal_bergabung:$("editTanggal").value,status:$("editStatus").value};
  if(!payload.nama||!payload.kelas||!payload.tanggal_bergabung){message("editAnggotaMessage","Lengkapi data anggota.","error");return}
  const btn=e.target.querySelector("button[type=submit]");setLoadingButton(btn,"Menyimpan...",true);
  try{
    const {error}=await supabaseClient.from("Anggota").update(payload).eq("id",id);
    if(error)throw error;
    $("formEditAnggota").classList.add("hidden");await loadAnggota();toast("Data anggota diperbarui.","success");
  }catch(err){console.error(err);message("editAnggotaMessage",err.message||"Gagal memperbarui.","error")}
  finally{setLoadingButton(btn,"",false)}
});

async function deleteMember(id){
  const m=anggotaData.find(x=>x.id===id); if(!m)return;
  if(!confirm(`Hapus anggota "${m.nama}"?`))return;
  try{
    const {error}=await supabaseClient.from("Anggota").delete().eq("id",id);
    if(error)throw error;
    await loadAnggota();await loadDashboard();toast("Anggota dihapus.","success");
  }catch(e){console.error(e);toast(e.message||"Gagal menghapus anggota.","error")}
}

/* ---------- QR ---------- */
async function openQR(id){
  const m=anggotaData.find(x=>x.id===id);
  if(!m){
    const {data,error}=await supabaseClient.from("Anggota").select("*").eq("id",id).single();
    if(error){toast("Data anggota tidak ditemukan.","error");return}
    selectedQRMember=data;
  }else selectedQRMember=m;
  $("qrMemberName").textContent=selectedQRMember.nama||"-";
  $("qrMemberClass").textContent=selectedQRMember.kelas||"-";
  $("qrCodeDisplay").innerHTML="";
  new QRCode($("qrCodeDisplay"),{text:selectedQRMember.qr_code||selectedQRMember.id,width:256,height:256,colorDark:"#071a32",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});
  showPage("qrPage");
}
$("backFromQR").addEventListener("click",async()=>{if(!goBack())showPage("anggotaPage",{pushHistory:false});if(currentPage==="anggotaPage")await loadAnggota($("searchAnggota").value)});
;

/* ---------- MEMBER MODE ---------- */
$("lihatAnggotaModeButton").addEventListener("click",async()=>{showPage("anggotaPage");await loadAnggota()});
$("lihatRekapModeButton").addEventListener("click",async()=>{$("rekapTanggal").value=getToday();showPage("rekapPage");await loadRekap()});
$("lihatPengumumanModeButton").addEventListener("click",async()=>{showPage("pengumumanPage");await loadPengumuman()});

/* ---------- SCANNER ---------- */
async function startScanner(){
  stopScanner();
  if(!window.Html5Qrcode){message("scannerMessage","Library scanner belum siap.","error");return}
  qrScanner=new Html5Qrcode("qr-reader");
  try{
    await qrScanner.start({facingMode:"environment"},{fps:10,qrbox:{width:220,height:220}},
      async decodedText=>{await handleQRScan(decodedText)},
      ()=>{});
  }catch(e){
    console.error(e);message("scannerMessage","Kamera tidak dapat dibuka. Gunakan daftar anggota di bawah.","error");
  }
}
async function handleQRScan(value){
  if(!value)return;
  let id=value.trim();
  try{const parsed=JSON.parse(value);id=parsed.id||parsed.anggota_id||value}catch(_){}
  const {data,error}=await supabaseClient.from("Anggota").select("*").or(`id.eq.${id},qr_code.eq.${id}`).maybeSingle();
  if(error||!data){message("scannerMessage","QR tidak terdaftar.","error");return}
  await recordAttendance(data,"hadir","QR");
}
async function recordAttendance(member,status,metode){
  if(!currentUser||!currentPetugas){toast("Sesi pengelola tidak aktif.","error");return false}
  const today=getToday();
  const lockKey=`${member.id}:${today}`;
  if(attendanceLocks.has(lockKey)){toast(`${member.nama} sedang diproses.` ,"warning");return false}
  attendanceLocks.set(lockKey,true);
  try{
    const {data:existing,error:findError}=await supabaseClient.from("Absensi").select("id").eq("anggota_id",member.id).eq("tanggal",today).maybeSingle();
    if(findError) throw findError;
    if(existing){toast(`${member.nama} sudah memiliki absensi hari ini.` ,"warning");message("scannerMessage",`${member.nama} sudah absen hari ini.` ,"warning");return false}
    const {error}=await supabaseClient.from("Absensi").insert({anggota_id:member.id,tanggal:today,jam:getCurrentTime(),status,metode,petugas_id:currentPetugas.id});
    if(error){
      const duplicate=error.code==="23505"||/duplicate|unique/i.test(error.message||"");
      if(duplicate){toast(`${member.nama} sudah memiliki absensi hari ini.` ,"warning");message("scannerMessage",`${member.nama} sudah absen hari ini.` ,"warning");return false}
      throw error;
    }
    toast(`${member.nama}: ${statusLabel(status)}.` ,"success");
    message("scannerMessage",`Absensi ${statusLabel(status)} berhasil disimpan.` ,"success");
    await loadDashboard();
    return true;
  }catch(err){console.error(err);toast(err.message||"Gagal menyimpan absensi.","error");return false}
  finally{setTimeout(()=>attendanceLocks.delete(lockKey),1200)}
}
function stopScanner(){
  if(qrScanner){
    qrScanner.stop().catch(()=>{}).finally(()=>{try{qrScanner.clear()}catch(_){};qrScanner=null});
  }
}
async function loadScannerMembers(search=""){
  const list=$("manualAnggotaList");list.innerHTML="";
  let q=supabaseClient.from("Anggota").select("*").order("nama");
  if(search.trim())q=q.or(`nama.ilike.%${search.trim()}%,kelas.ilike.%${search.trim()}%`);
  const {data,error}=await q;if(error){toast("Gagal memuat anggota.","error");return}
  (data||[]).forEach(m=>{
    const b=document.createElement("button");b.type="button";b.className="compact-member";
    b.innerHTML=`<span class="avatar">${escapeHTML(getInitials(m.nama))}</span><span class="compact-member-info"><strong>${escapeHTML(m.nama)}</strong><span>${escapeHTML(m.kelas)}</span></span><b>›</b>`;
    b.addEventListener("click",()=>recordAttendance(m,"hadir","Manual"));
    list.appendChild(b);
  });
}
$("manualSearch").addEventListener("input",e=>loadScannerMembers(e.target.value));
$("backFromScanner").addEventListener("click",async()=>{stopScanner();if(!goBack())showPage("dashboardPage",{pushHistory:false});if(currentPage==="dashboardPage")await loadDashboard()});

/* ---------- MANUAL ATTENDANCE ---------- */
function resetManual(){
  selectedManualMember=null;
  $("selectedManualAnggota").classList.add("hidden");
  $("manualAbsensiForm").classList.add("hidden");
  $("manualAbsensiSearch").value="";
  document.querySelectorAll('input[name="manualStatus"]').forEach(r=>r.checked=r.value==="hadir");
  message("manualAbsensiMessage","");
}
async function loadManualMembers(search=""){
  const list=$("manualAbsensiAnggotaList");list.innerHTML="";
  let q=supabaseClient.from("Anggota").select("*").order("nama");
  if(search.trim())q=q.or(`nama.ilike.%${search.trim()}%,kelas.ilike.%${search.trim()}%`);
  const {data,error}=await q;if(error){toast("Gagal memuat anggota.","error");return}
  (data||[]).forEach(m=>{
    const b=document.createElement("button");b.type="button";b.className="compact-member";
    b.innerHTML=`<span class="avatar">${escapeHTML(getInitials(m.nama))}</span><span class="compact-member-info"><strong>${escapeHTML(m.nama)}</strong><span>${escapeHTML(m.kelas)}</span></span><b>›</b>`;
    b.addEventListener("click",()=>selectManualMember(m));
    list.appendChild(b);
  });
}
function selectManualMember(m){
  selectedManualMember=m;
  $("selectedManualAvatar").textContent=getInitials(m.nama);
  $("selectedManualNama").textContent=m.nama;
  $("selectedManualKelas").textContent=m.kelas;
  $("selectedManualAnggota").classList.remove("hidden");
  $("manualAbsensiForm").classList.remove("hidden");
  $("manualAbsensiAnggotaList").innerHTML="";
  $("manualAbsensiSearch").value="";
}
$("manualAbsensiSearch").addEventListener("input",e=>{
  if(selectedManualMember)return;
  loadManualMembers(e.target.value);
});
$("clearSelectedManual").addEventListener("click",async()=>{
  resetManual();
  $("manualAbsensiSearch").value="";
  await loadManualMembers("");
});
$("manualAbsensiForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!selectedManualMember){toast("Pilih anggota terlebih dahulu.","warning");return}
  const status=document.querySelector('input[name="manualStatus"]:checked')?.value||"hadir";
  const btn=$("simpanManualAbsensi");setLoadingButton(btn,"Menyimpan...",true);
  try{
    const ok=await recordAttendance(selectedManualMember,status,"Manual");
    if(ok){
      message("manualAbsensiMessage",`Absensi ${statusLabel(status)} berhasil disimpan.`,"success");
      resetManual();await loadManualMembers();
    }
  }finally{setLoadingButton(btn,"",false)}
});
$("backFromManualAbsensi").addEventListener("click",async()=>{resetManual();if(!goBack())showPage("dashboardPage",{pushHistory:false});if(currentPage==="dashboardPage")await loadDashboard()});

/* ---------- REKAP ---------- */
async function loadRekap(){
  const tanggal=$("rekapTanggal").value||getToday();
  const {data,error}=await supabaseClient.from("Absensi").select(`id,anggota_id,tanggal,jam,status,metode,petugas_id,Anggota(id,nama,kelas,status)`).eq("tanggal",tanggal).order("jam",{ascending:false});
  if(error){console.error(error);toast("Gagal memuat rekap.","error");return}
  const records=data||[];
  $("rekapTotal").textContent=records.length;
  $("rekapHadir").textContent=records.filter(x=>x.status==="hadir").length;
  $("rekapSakit").textContent=records.filter(x=>x.status==="sakit").length;
  $("rekapIzin").textContent=records.filter(x=>x.status==="izin").length;
  $("rekapTanpaKeterangan").textContent=records.filter(x=>x.status==="tanpa keterangan").length;
  $("rekapEmptyState").classList.toggle("hidden",records.length>0);
  const list=$("rekapList");list.innerHTML="";
  records.forEach(r=>{
    const m=r.Anggota;
    const item=document.createElement("article");item.className="recap-item";
    item.innerHTML=`<span class="avatar">${escapeHTML(getInitials(m?.nama||"?"))}</span><span class="recap-info"><strong>${escapeHTML(m?.nama||"Anggota sudah dihapus")}</strong><span>${escapeHTML(m?.kelas||"-")} · ${escapeHTML(String(r.jam||"").slice(0,5))} · ${escapeHTML(r.metode||"-")}</span></span><span class="recap-status ${statusClass(r.status)}">${escapeHTML(statusLabel(r.status))}</span>`;
    list.appendChild(item);
  });
}
$("rekapTanggal").value=getToday();
$("rekapTanggal").addEventListener("change",loadRekap);
$("resetRekapFilter").addEventListener("click",()=>{$("rekapTanggal").value=getToday();loadRekap()});
$("backFromRekap").addEventListener("click",async()=>{if(!goBack())showPage(currentMode==="anggota"?"anggotaHomePage":"dashboardPage",{pushHistory:false});if(currentMode==="pengelola"&&currentPage==="dashboardPage")await loadDashboard()});

/* ---------- PENGUMUMAN ---------- */
function formatTanggalWaktu(v){
  if(!v) return "-";
  const d=new Date(v);
  if(Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"})+" · "+d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"});
}
function formatRole(role){
  const map={ketua:"Ketua",sekretaris:"Sekretaris",bendahara:"Bendahara",pembina:"Pembina",petugas:"Petugas"};
  return map[String(role||"").toLowerCase()] || String(role||"Petugas").replace(/\b\w/g,c=>c.toUpperCase());
}
async function loadPengumuman(){
  const list=$("pengumumanList");
  if(!list) return;
  list.innerHTML="";
  const {data,error}=await supabaseClient.from("Pengumuman").select("id,judul,isi,petugas_id,petugas_nama,petugas_role,dibuat_pada").order("dibuat_pada",{ascending:false});
  if(error){console.error(error);toast("Gagal memuat pengumuman.","error");return}
  const rows=data||[];
  $("jumlahPengumuman").textContent=rows.length;
  $("pengumumanEmptyState").classList.toggle("hidden",rows.length>0);
  rows.forEach(item=>{
    const article=document.createElement("article");article.className="announcement-item";
    article.innerHTML=`<div class="announcement-top"><h2 class="announcement-title">${escapeHTML(item.judul)}</h2><time class="announcement-date">${escapeHTML(formatTanggalWaktu(item.dibuat_pada))}</time></div><p class="announcement-body">${escapeHTML(item.isi)}</p><div class="announcement-author"><span class="announcement-author-avatar">${escapeHTML(getInitials(item.petugas_nama))}</span><span class="announcement-author-text"><strong>${escapeHTML(item.petugas_nama||"Petugas")}</strong><span>${escapeHTML(formatRole(item.petugas_role))}</span></span></div>`;
    list.appendChild(article);
  });
}
function resetFormPengumuman(){
  $("formPengumuman")?.reset();
  message("pengumumanMessage","");
  $("formPengumumanPanel")?.classList.add("hidden");
}
$("tambahPengumumanButton").addEventListener("click",()=>{
  $("formPengumumanPanel").classList.toggle("hidden");
  if(!$("formPengumumanPanel").classList.contains("hidden")) $("judulPengumuman").focus();
});
$("batalPengumuman").addEventListener("click",resetFormPengumuman);
$("formPengumuman").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!currentUser||!currentPetugas){toast("Sesi pengelola tidak aktif.","error");return}
  const judul=$("judulPengumuman").value.trim();
  const isi=$("isiPengumuman").value.trim();
  if(!judul||!isi){message("pengumumanMessage","Judul dan isi pengumuman wajib diisi.","error");return}
  const btn=$("simpanPengumuman");setLoadingButton(btn,"Menerbitkan...",true);message("pengumumanMessage","");
  try{
    const {error}=await supabaseClient.from("Pengumuman").insert({
      judul,isi,petugas_id:currentPetugas.id,petugas_nama:currentPetugas.nama,petugas_role:currentPetugas.role,dibuat_pada:new Date().toISOString()
    });
    if(error) throw error;
    resetFormPengumuman();
    await loadPengumuman();
    toast("Pengumuman berhasil diterbitkan.","success");
  }catch(err){console.error(err);message("pengumumanMessage",err.message||"Gagal menerbitkan pengumuman.","error")}
  finally{setLoadingButton(btn,"",false)}
});
$("backFromPengumuman").addEventListener("click",async()=>{
  resetFormPengumuman();
  if(!goBack())showPage(currentMode==="anggota"?"anggotaHomePage":"dashboardPage",{pushHistory:false});
  if(currentMode==="pengelola"&&currentPage==="dashboardPage")await loadDashboard();
});

/* ---------- REALTIME ---------- */
function setupRealtime(){
  if(realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel=supabaseClient.channel("e-absensi-realtime-rebuild")
    .on("postgres_changes",{event:"*",schema:"public",table:"Anggota"},async()=>{
      if(currentPage==="anggotaPage")await loadAnggota($("searchAnggota").value);
      if(currentPage==="dashboardPage")await loadDashboard();
      if(currentPage==="scannerPage")await loadScannerMembers($("manualSearch").value);
      if(currentPage==="manualAbsensiPage"&&!selectedManualMember)await loadManualMembers($("manualAbsensiSearch").value);
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"Absensi"},async()=>{
      if(currentPage==="rekapPage")await loadRekap();
      if(currentPage==="dashboardPage")await loadDashboard();
    })
    .on("postgres_changes",{event:"*",schema:"public",table:"Pengumuman"},async()=>{
      if(currentPage==="pengumumanPage")await loadPengumuman();
    }).subscribe();
}

/* ---------- INIT ---------- */
window.addEventListener("popstate",async(event)=>{
  if(currentPage==="scannerPage")stopScanner();
  const previous=navigationStack.pop();
  if(previous){
    isPopStateNavigation=true;
    showPage(previous,{pushHistory:false});
    isPopStateNavigation=false;
    if(currentPage==="dashboardPage"&&currentMode==="pengelola")await loadDashboard();
    return;
  }
  // Root halaman aplikasi: tahan tombol Back agar tidak langsung meninggalkan SPA.
  if(currentMode==="pengelola"&&currentUser){
    resetNavigation("dashboardPage");
    showPage("dashboardPage",{pushHistory:false});
    await loadDashboard();
  }else if(currentMode==="anggota"){
    resetNavigation("anggotaHomePage");
    showPage("anggotaHomePage",{pushHistory:false});
  }else{
    resetNavigation("modePage");
    showPage("modePage",{pushHistory:false});
  }
});

async function restoreSession(){
  try{
    const {data,error}=await supabaseClient.auth.getSession();
    if(error)throw error;
    currentUser=data.session?.user||null;
    if(currentUser){
      const petugas=await getPetugas();
      if(petugas){
        setMode("pengelola");resetNavigation("dashboardPage");showPage("dashboardPage",{pushHistory:false});await loadDashboard();
      }else{
        await supabaseClient.auth.signOut();currentUser=null;currentPetugas=null;setMode(null);resetNavigation("modePage");showPage("modePage",{pushHistory:false});
      }
    }else{resetNavigation("modePage");showPage("modePage",{pushHistory:false})}
  }catch(err){console.error("Gagal memulihkan sesi:",err);resetNavigation("modePage");showPage("modePage",{pushHistory:false})}
  finally{setTimeout(()=>$("loadingScreen").classList.add("hidden"),350)}
}

supabaseClient.auth.onAuthStateChange((_event,session)=>{
  currentUser=session?.user||null;
  if(!session){currentPetugas=null;if(currentMode==="pengelola"){setMode(null);resetNavigation("modePage");showPage("modePage",{pushHistory:false})}}
});
setupRealtime();
window.addEventListener("beforeunload",()=>{stopScanner();if(realtimeChannel)supabaseClient.removeChannel(realtimeChannel)});
restoreSession();
