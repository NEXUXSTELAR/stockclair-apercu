"use strict";
/* L'équipe : la fiche de chacun, le compte rendu de ses gestes, sa photo, et l'invitation.
   - Qui voit qui : chacun voit sa propre fiche. Le gérant voit toute l'équipe. Le responsable voit les personnes
     du dépôt et de la route, pas le gérant ni les autres responsables. Le droit « profils » se règle par rôle (config.js).
   - Ce qu'on voit : les gestes de stock (quoi, combien, quand). Jamais la position, jamais un temps de travail.
   - L'invitation : le responsable ne choisit plus le mot de passe de quelqu'un d'autre. Il envoie un lien (ou montre un QR code) ;
     la personne choisit son mot de passe, puis met l'appli sur son écran d'accueil. Aucun magasin d'applications.
   Chargé avant app.js : les fonctions utilisent l'état et les outils d'app.js au moment où elles tournent. */

/* ---------------- Qui voit qui ---------------- */
const RANG = { terrain: 1, chauffeur: 1, bureau: 2, direction: 3 };
const peutVoirFiche = u => !!(u && session && (u.id === session.uid || (droit("profils") && (session.profil === "direction" || (RANG[u.role] || 1) < (RANG[session.profil] || 1)))));
const fichesVisibles = () => session ? S.equipe.filter(u => u.id !== session.uid && peutVoirFiche(u)) : [];
// La dernière connexion ne se montre qu'à la direction et à la personne elle-même.
const voitConnexions = u => u.id === session.uid || session.profil === "direction";

/* ---------------- Les gestes d'une personne ---------------- */
// Un geste porte l'identifiant interne de la personne depuis cette version ; les lignes plus anciennes portent son prénom.
const gesteDe = (m, u) => m.uid ? m.uid === u.id : m.qui === u.nom;
function gestesDe(u, jours) {
  const annules = new Set(S.mouvements.filter(m => m.annule).map(m => m.annule));
  const depuis = jours ? Date.now() - jours * 86400000 : 0;
  return S.mouvements.filter(m => gesteDe(m, u) && m.date >= depuis && !m.annule && !annules.has(m.id)).sort((a, b) => b.date - a.date);
}
const FAMILLES = {
  sortie: { t: "Sorties", c: "sortie", types: ["Prêt", "Sortie", "Envoi"] },
  retour: { t: "Retours et entrées", c: "retour", types: ["Retour", "Entrée", "Retour réparation", "Inventaire initial"] },
  compter: { t: "Comptages et contrôles", c: "compter", types: ["Ajustement", "Contrôle", "Transfert", "Fiche"] },
  perte: { t: "Pertes signalées", c: "alerte", types: ["Perte", "Réparation"] },
};
const familleDe = m => Object.keys(FAMILLES).find(k => FAMILLES[k].types.includes(m.type)) || "compter";
const MOTS_GESTES = { "Prêt": "Sortie", "Sortie": "Sortie", "Envoi": "Envoi à un autre établissement", "Retour": "Retour", "Entrée": "Réception", "Retour réparation": "Retour de l'atelier", "Inventaire initial": "Inventaire de départ", "Ajustement": "Comptage corrigé", "Contrôle": "Contrôle fait", "Transfert": "Déplacement", "Fiche": "Fiche modifiée", "Perte": "Perte signalée", "Réparation": "Envoi à l'atelier" };
function resumeGestes(l) {
  const r = { total: l.length, sortie: 0, retour: 0, compter: 0, perte: 0, valeurPertes: 0, objets: {} };
  l.forEach(m => {
    const f = familleDe(m); r[f] += 1;
    if (m.type === "Perte") { const a = art(m.article); if (a) r.valeurPertes += Math.abs(m.qte) * a.prix; }
    r.objets[m.article] = (r.objets[m.article] || 0) + 1;
  });
  return r;
}
const jourDe = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
// Nombre de gestes par jour sur les n derniers jours, du plus ancien au plus récent.
function parJour(l, n) {
  const auj = jourDe(Date.now()), cases = Array.from({ length: n }, (_, i) => ({ t: auj - (n - 1 - i) * 86400000, n: 0 }));
  l.forEach(m => { const i = n - 1 - Math.round((auj - jourDe(m.date)) / 86400000); if (i >= 0 && i < n) cases[i].n += 1; });
  return cases;
}
function dernierGeste(u) { const l = gestesDe(u); return l.length ? l[0] : null; }
const ilYA = t => {
  const j = Math.round((jourDe(Date.now()) - jourDe(t)) / 86400000), h = new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return j <= 0 ? "aujourd'hui à " + h : j === 1 ? "hier à " + h : j < 7 ? "il y a " + j + " jours" : "le " + new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};
const etatAcces = u => !u.actif ? "accès retiré" : !u.empreinte ? "invitation en attente" : "";

/* ---------------- Les cartes de l'équipe ---------------- */
function miniBarres(cases) {
  const max = Math.max(1, ...cases.map(c => c.n));
  return `<span class="eq-mini" aria-hidden="true">${cases.map(c => `<i class="${c.n ? "" : "z"}" style="height:${c.n ? Math.max(18, Math.round(c.n / max * 100)) : 10}%"></i>`).join("")}</span>`;
}
function carteEquipe(u) {
  const sept = gestesDe(u, 7), d = dernierGeste(u), e = etatAcces(u), moiMeme = u.id === session.uid;
  return `<button class="eq-carte ${u.actif ? "" : "inactif"}" data-personne="${u.id}">${avatar(u, true)}
    <span class="eq-nom"><b>${esc(u.nom)}${moiMeme ? ` <span class="statut">vous</span>` : ""}</b><small>${esc(u.poste || PROFILS[u.role].nom)}</small>${e ? `<small><span class="statut ${u.actif ? "s-confirme" : ""}">${e}</span></small>` : ""}</span>
    <span class="eq-bas"><span><b>${sept.length}</b> geste${sept.length > 1 ? "s" : ""} sur 7 jours<small>${d ? "Dernier geste " + ilYA(d.date) : "Aucun geste enregistré"}</small></span>${miniBarres(parJour(sept, 7))}</span>
  </button>`;
}
// Les fiches que la personne connectée a le droit d'ouvrir, la sienne d'abord.
function cartesEquipe() {
  const l = [moi()].filter(u => u.id).concat(fichesVisibles());
  return `<div class="eq-grille">${l.map(carteEquipe).join("")}</div>`;
}
// Les derniers gestes de l'équipe, toutes personnes visibles confondues.
function fluxEquipe(n) {
  const vus = fichesVisibles(), annules = new Set(S.mouvements.filter(m => m.annule).map(m => m.annule));
  const l = S.mouvements.filter(m => !m.annule && !annules.has(m.id) && m.type !== "Inventaire initial" && vus.some(u => gesteDe(m, u))).sort((a, b) => b.date - a.date).slice(0, n || 6);
  if (!l.length) return `<p class="vide" style="padding:4px 0">Aucun geste enregistré pour l'instant.</p>`;
  return `<ul class="eq-flux">${l.map(m => { const u = vus.find(x => gesteDe(m, x)), a = art(m.article); return `<li><button data-personne="${u.id}" class="c-${FAMILLES[familleDe(m)].c}">${avatar(u)}<span><b>${esc(u.nom)} · ${esc(MOTS_GESTES[m.type] || m.type)}</b><small>${qteGeste(m)}${esc(a ? a.nom : m.article)}${m.evenement || m.imputation ? " · " + esc(m.evenement || m.imputation) : ""}</small><small class="eq-quand">${ilYA(m.date)}</small></span></button></li>`; }).join("")}</ul>`;
}
const qteGeste = m => ["Contrôle", "Fiche"].includes(m.type) ? "" : Math.abs(m.qte).toLocaleString("fr-FR") + " × ";

/* L'onglet « Équipe » de l'accueil : les derniers gestes, puis les fiches. */
function ongletEquipe() {
  return `<div class="bento"><section class="w w-l"><h3 class="w-titre">Derniers gestes de l'équipe</h3>${fluxEquipe(6)}</section></div>
  <h2>Les fiches</h2>${cartesEquipe()}
  ${permis("equipe") ? `<p style="margin-top:14px"><button class="btn" data-racine="equipe">${I.equipe}Ouvrir l'écran Équipe</button></p>` : ""}`;
}

/* ---------------- Écran « Équipe » ---------------- */
let ongletEq = "fiches";
function vEquipe() {
  const admin = session.admin && droit("equipe");
  if (!admin) ongletEq = "fiches";
  const attente = S.equipe.filter(u => u.actif && !u.empreinte).length;
  return `<h1>Équipe</h1>
  <p class="sous">${session.profil === "direction" ? "La fiche de chacun, avec ses gestes de stock : qui a fait quoi, et quand." : "Les fiches des personnes du dépôt et de la route, avec leurs gestes de stock."}</p>
  ${admin ? `<div class="segments" role="group" aria-label="Partie de l'écran"><button data-onglet-eq="fiches" aria-pressed="${ongletEq === "fiches"}">Les fiches</button><button data-onglet-eq="acces" aria-pressed="${ongletEq === "acces"}">Accès et sécurité${attente ? ` <span class="nb-attente">${attente}</span>` : ""}</button></div>` : ""}
  ${ongletEq === "acces" && admin ? dAcces() : `${cartesEquipe()}
    ${admin ? `<p style="margin-top:14px"><button class="btn plein" data-act="ajouterPersonne">${I.equipe}Ajouter une personne</button></p>` : ""}
    <div class="eq-note"><b>Ce que montrent ces fiches</b><p>Les gestes enregistrés dans l'appli : une sortie, un retour, un comptage, une perte signalée. L'appli ne relève ni la position des personnes, ni leur temps de travail. Chacun voit sa propre fiche, à tout moment.</p></div>`}`;
}

/* ---------------- Fiche d'une personne ---------------- */
let periodeFiche = 30, nFiche = 30;
function grapheGestes(l, jours) {
  // 7 ou 30 jours : une colonne par jour. 90 jours : une colonne par semaine.
  const parSem = jours > 30, cases = parJour(l, parSem ? 91 : jours);
  const cols = parSem ? Array.from({ length: 13 }, (_, i) => ({ t: cases[i * 7].t, n: cases.slice(i * 7, i * 7 + 7).reduce((t, c) => t + c.n, 0) })) : cases;
  const etroit = window.innerWidth < 720, max = Math.max(1, ...cols.map(c => c.n)), W = etroit ? 340 : 640, H = etroit ? 120 : 150, pas = W / cols.length, lg = Math.min(34, pas * .62);
  const jour = t => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `<div class="graphe eq-graphe"><h3>Gestes ${parSem ? "par semaine" : "par jour"}</h3><p class="q">Quand cette personne a-t-elle travaillé sur le stock ?</p>
    <svg viewBox="0 0 ${W} ${H + 26}" role="img" aria-label="Gestes ${parSem ? "par semaine" : "par jour"} sur ${jours} jours">
      <line x1="0" y1="${H}" x2="${W}" y2="${H}" stroke="var(--trait-fort)" stroke-width="1"/>
      ${cols.map((c, i) => { const h = c.n ? Math.max(4, c.n / max * (H - 22)) : 0, x = i * pas + (pas - lg) / 2; return `<g data-tip="${c.n} geste${c.n > 1 ? "s" : ""} · ${parSem ? "semaine du " : ""}${jour(c.t)}"><rect x="${(i * pas).toFixed(1)}" y="0" width="${pas.toFixed(1)}" height="${H}" fill="transparent"/>${c.n ? `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${lg.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="var(--depot)"/>${etroit && cols.length > 14 ? "" : `<text class="v" x="${(x + lg / 2).toFixed(1)}" y="${(H - h - 5).toFixed(1)}" text-anchor="middle">${c.n}</text>`}` : ""}</g>`; }).join("")}
      <text x="0" y="${H + 18}">${jour(cols[0].t)}</text><text x="${W}" y="${H + 18}" text-anchor="end">${jour(cols[cols.length - 1].t)}</text>
    </svg></div>`;
}
function lignesGestes(l) {
  let jour = "";
  return `<ul class="eq-fil">${l.map(m => {
    const a = art(m.article), d = new Date(m.date), j = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const tete = j !== jour ? `<li class="eq-jour">${j}</li>` : ""; jour = j;
    return `${tete}<li><button class="c-${FAMILLES[familleDe(m)].c}" ${a && S.articles.includes(a) ? `data-${permis("materiel") ? "fiche" : "objet"}="${a.id}"` : "disabled"}><i aria-hidden="true"></i><time>${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time><span><b>${esc(MOTS_GESTES[m.type] || m.type)} · ${qteGeste(m)}${esc(a ? a.nom : m.article)}</b>${m.evenement || m.imputation || m.motif ? `<small>${esc([m.evenement || m.imputation, m.motif].filter(Boolean).join(" · "))}</small>` : ""}</span></button></li>`;
  }).join("")}</ul>`;
}
function vPersonne(uid) {
  const u = S.equipe.find(x => x.id === (uid || session.uid));
  if (!u || !peutVoirFiche(u)) return `<h1>Pas d'accès</h1><p class="sous">Cette fiche n'est pas prévue pour votre rôle. Demandez à votre responsable.</p>`;
  const moiMeme = u.id === session.uid, admin = session.admin && droit("equipe");
  const l = gestesDe(u, periodeFiche), r = resumeGestes(l), prix = droit("prix");
  const cx = voitConnexions(u) ? S.connexions.find(c => c.uid === u.id && c.ok) : null;
  const top = Object.entries(r.objets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ a: art(id), n })).filter(x => x.a);
  const e = etatAcces(u);
  return `<div class="eq-tete">
    ${moiMeme ? `<button class="eq-photo" data-photo aria-label="Changer ma photo">${avatar(u, "tres")}<span class="eq-photo-pic">${I.appareil}</span></button>` : avatar(u, "tres")}
    <div><h1>${esc(u.nom)}</h1><p class="sous">${esc(u.poste || PROFILS[u.role].nom)} · ${esc(ROLES[u.role].split(" : ")[0])}</p>
      <p class="eq-pastilles">${u.admin ? `<span class="statut">administre le compte</span>` : ""}${e ? `<span class="statut ${u.actif ? "s-confirme" : "s-partie"}">${e}</span>` : ""}${cx ? `<span class="statut">dernière connexion ${ilYA(cx.date)}</span>` : ""}</p></div>
  </div>
  ${moiMeme ? `<div class="eq-actions"><button class="btn petit" data-photo>${I.appareil}${u.photo ? "Changer ma photo" : "Ajouter ma photo"}</button><button class="btn petit" data-nouveau-code="${u.id}">${I.cadenas}Changer mon mot de passe</button></div>`
    : admin && !u.empreinte && u.actif ? `<div class="eq-actions"><button class="btn petit plein" data-inviter="${u.id}">${I.partager}Envoyer l'invitation</button></div>` : ""}
  <div class="w-entete" style="margin-top:22px"><h2 style="margin:0">Compte rendu d'activité</h2><div class="segments" role="group" aria-label="Période">${[7, 30, 90].map(j => `<button data-periode-fiche="${j}" aria-pressed="${periodeFiche === j}">${j} j</button>`).join("")}</div></div>
  <div class="eq-chiffres">
    <div><b data-compte="${r.total}">${r.total}</b><span>geste${r.total > 1 ? "s" : ""} en ${periodeFiche} jours</span></div>
    <div class="c-sortie"><b data-compte="${r.sortie}">${r.sortie}</b><span>sorties</span></div>
    <div class="c-retour"><b data-compte="${r.retour}">${r.retour}</b><span>retours et entrées</span></div>
    <div class="c-compter"><b data-compte="${r.compter}">${r.compter}</b><span>comptages et contrôles</span></div>
    <div class="c-alerte"><b data-compte="${r.perte}">${r.perte}</b><span>pertes signalées${prix && r.valeurPertes ? " · " + argent(r.valeurPertes) : ""}</span></div>
  </div>
  ${grapheGestes(l, periodeFiche)}
  ${top.length ? `<h2>Ce qui passe le plus entre ses mains</h2><ul class="b-liste">${top.map(x => `<li><button class="l" ${S.articles.includes(x.a) ? `data-${permis("materiel") ? "fiche" : "objet"}="${x.a.id}"` : "disabled"}>${img(x.a)}<span><b>${esc(x.a.nom)}</b><small>${x.n} geste${x.n > 1 ? "s" : ""}</small></span><span class="n">${x.n}</span></button></li>`).join("")}</ul>` : ""}
  <h2>Derniers gestes</h2>
  ${l.length ? `${lignesGestes(l.slice(0, nFiche))}${l.length > nFiche ? `<p style="margin-top:12px"><button class="btn" data-plus-fiche>Afficher ${Math.min(30, l.length - nFiche)} gestes de plus</button></p>` : ""}` : `<p class="vide">Aucun geste enregistré sur cette période.</p>`}
  <div class="eq-actions" style="margin-top:18px"><button class="btn petit" data-aller="compteRendu" data-arg="${u.id}">${I.imprimer}Compte rendu à imprimer</button><button class="btn petit" data-export-fiche="${u.id}">${I.excel}Exporter en Excel</button></div>
  ${!moiMeme && admin ? `<p class="eq-admin">Accès : <button class="lien" data-inviter="${u.id}">envoyer un nouveau lien d'accès</button>${u.photo ? ` · <button class="lien" data-retirer-photo="${u.id}">retirer la photo</button>` : ""}</p>` : ""}
  ${moiMeme ? `<div class="eq-note"><b>Qui voit cette fiche</b><p>Vous, ${session.profil === "direction" ? "et les autres personnes de la direction" : session.profil === "bureau" ? "et la direction" : "votre responsable et la direction"}. Elle montre vos gestes de stock : quoi, combien, quand. L'appli ne relève ni votre position, ni votre temps de travail.</p></div>` : ""}`;
}

/* Compte rendu à imprimer : sur papier blanc, comme les autres documents. */
function vCompteRendu(uid) {
  const u = S.equipe.find(x => x.id === uid);
  if (!u || !peutVoirFiche(u)) return `<h1>Pas d'accès</h1><p class="sous">Ce document n'est pas prévu pour votre rôle.</p>`;
  const l = gestesDe(u, periodeFiche), r = resumeGestes(l), prix = droit("prix"), fin = new Date(), debut = new Date(Date.now() - periodeFiche * 86400000);
  const jj = d => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `<p class="pas-imprimer"><button class="lien" data-aller="personne" data-arg="${u.id}">← Fiche de ${esc(u.nom)}</button> · <button class="lien" data-act="imprimer">Imprimer ou enregistrer en PDF</button></p>
  <div class="feuille-doc">${enTeteDoc()}<h1>Compte rendu d'activité</h1>
  <p><b>${esc(u.nom)}</b>, ${esc(u.poste || "")}<br>Du ${jj(debut)} au ${jj(fin)} · édité par ${esc(moi().nom)}</p>
  <table><tbody><tr><td>Gestes enregistrés</td><td class="n">${r.total}</td></tr><tr><td>Sorties</td><td class="n">${r.sortie}</td></tr><tr><td>Retours et entrées</td><td class="n">${r.retour}</td></tr><tr><td>Comptages et contrôles</td><td class="n">${r.compter}</td></tr><tr><td>Pertes signalées</td><td class="n">${r.perte}${prix && r.valeurPertes ? " · " + argent(r.valeurPertes) : ""}</td></tr></tbody></table>
  <h2>Détail des gestes</h2>
  ${l.length ? `<div class="defile"><table class="etroit"><thead><tr><th>Date et heure</th><th>Geste</th><th>Objet</th><th class="n">Quantité</th><th>${esc(V("imp") || "Pour")}</th></tr></thead><tbody>${l.slice(0, 300).map(m => { const a = art(m.article); return `<tr><td>${quand(m.date)}</td><td>${esc(MOTS_GESTES[m.type] || m.type)}</td><td>${esc(a ? a.nom : m.article)}</td><td class="n">${qteSignee(m)}</td><td>${esc([m.evenement || m.imputation, m.motif].filter(Boolean).join(" · "))}</td></tr>`; }).join("")}</tbody></table></div>${l.length > 300 ? `<p class="petit">Les 300 gestes les plus récents sont imprimés. L'export Excel les contient tous.</p>` : ""}` : `<p>Aucun geste enregistré sur cette période.</p>`}
  <p class="petit">Ce document reprend les gestes enregistrés dans l'appli. Il ne mesure ni la présence, ni le temps de travail.</p></div>`;
}
function exporterFiche(uid) {
  const u = S.equipe.find(x => x.id === uid); if (!u || !peutVoirFiche(u)) return;
  const prix = droit("prix"), l = gestesDe(u, periodeFiche).slice().reverse();
  const colonnes = [{ t: "Date et heure", l: 17, f: "dateheure" }, { t: "Geste", l: 24 }, { t: "Code", l: 11 }, { t: "Objet", l: 32 }, { t: "Quantité", l: 10, f: "entier", somme: false }, { t: V("imp") || "Pour", l: 30 }, { t: "Motif", l: 24 }].concat(prix ? [{ t: "Valeur", l: 14, f: "argent", somme: false }] : []);
  const lignes = l.map(m => { const a = art(m.article); return [m.date, MOTS_GESTES[m.type] || m.type, m.article, a ? a.nom : "", m.qte, m.evenement || m.imputation || "", m.motif || ""].concat(prix ? [a && m.type !== "Transfert" ? Math.abs(m.qte) * a.prix : 0] : []); });
  telechargerXlsx(fichier("activite-" + u.identifiant), [{ nom: "Activité", titre: `${nomEntreprise()} · Activité de ${u.nom}`, sousTitre: sousTitreExport() + ` · ${periodeFiche} derniers jours`, colonnes, lignes }]);
  toast("Compte rendu exporté en Excel.");
}

/* ---------------- Photo de profil ----------------
   La photo est réduite sur le téléphone (192 px, quelques kilo-octets) avant d'être enregistrée. */
function reduirePhoto(fichierImage) {
  return new Promise((ok, ko) => {
    const i = new Image(), url = URL.createObjectURL(fichierImage);
    i.onload = () => {
      const c = document.createElement("canvas"), t = 192, cote = Math.min(i.naturalWidth, i.naturalHeight);
      c.width = c.height = t;
      c.getContext("2d").drawImage(i, (i.naturalWidth - cote) / 2, (i.naturalHeight - cote) / 2, cote, cote, 0, 0, t, t);
      URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", .82));
    };
    i.onerror = () => { URL.revokeObjectURL(url); ko(new Error("image")); };
    i.src = url;
  });
}
function feuillePhoto() {
  const u = moi(); if (!u.id) return;
  const f = ouvrirFeuille(`<div role="dialog" aria-modal="true" aria-labelledby="tph"><h1 id="tph" style="font-size:26px">Ma photo</h1>
    <p class="sous">Elle s'affiche à côté de votre prénom, dans l'équipe et sur votre fiche. Un visage bien cadré suffit.</p>
    <div class="eq-apercu">${avatar(u, "tres")}</div>
    <label class="btn plein" style="margin-top:14px">${I.appareil}Prendre ou choisir une photo<input type="file" accept="image/*" class="cache" data-fichier></label>
    <div class="valider" style="grid-template-columns:${u.photo ? "1fr 1fr" : "1fr"}">${u.photo ? `<button class="btn" data-retirer>Retirer la photo</button>` : ""}<button class="btn" data-x>Fermer</button></div></div>`);
  f.querySelector("[data-x]").onclick = () => f.remove();
  const ret = f.querySelector("[data-retirer]"); if (ret) ret.onclick = () => { delete u.photo; sauver(); f.remove(); rendre(); toast("Photo retirée."); };
  f.querySelector("[data-fichier]").onchange = async ev => {
    const fi = ev.target.files[0]; if (!fi) return;
    try { u.photo = await reduirePhoto(fi); sauver(); f.remove(); rendre(); toast("Photo enregistrée."); }
    catch (x) { toast("Cette image n'a pas pu être lue. Essayez une autre photo."); }
  };
}

/* ---------------- Ajouter une personne et l'inviter ---------------- */
function prochainUid() { let n = 0; S.equipe.forEach(u => { const k = +String(u.id).replace(/\D/g, ""); if (k > n) n = k; }); return "U-" + String(n + 1).padStart(2, "0"); }
function feuilleAjouter() {
  const f = ouvrirFeuille(`<div role="dialog" aria-modal="true" aria-labelledby="taj"><h1 id="taj" style="font-size:26px">Ajouter une personne</h1>
    <p class="sous">Vous ne choisissez pas son mot de passe. Vous lui envoyez un lien, elle choisit le sien.</p>
    <label class="champ">Prénom<input name="nom" autocomplete="off" maxlength="30"></label>
    <label class="champ">Identifiant<input name="ident" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="30" placeholder="prenom ou prenom.nom"></label>
    <label class="champ">Poste<input name="poste" autocomplete="off" maxlength="40" placeholder="Magasinier, chauffeur…"></label>
    <label class="champ">Rôle<select name="role">${Object.entries(ROLES).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></label>
    <div class="valider"><button class="btn" data-x>Annuler</button><button class="btn plein" data-ok>Créer et inviter</button></div>
    <p style="text-align:center;margin:14px 0 0"><button class="lien" data-mdp>Lui donner un mot de passe moi-même</button></p></div>`);
  const champ = n => f.querySelector(`[name=${n}]`);
  champ("nom").oninput = () => { if (!champ("ident").dataset.touche) champ("ident").value = sansAccent(champ("nom").value).replace(/[^a-z0-9.-]/g, ""); };
  champ("ident").oninput = () => { champ("ident").dataset.touche = "1"; };
  f.querySelector("[data-x]").onclick = () => f.remove();
  f.querySelector("[data-mdp]").onclick = () => { f.remove(); feuilleCode(null); };
  f.querySelector("[data-ok]").onclick = () => {
    const nom = champ("nom").value.trim(), ident = champ("ident").value.trim().toLowerCase(), role = champ("role").value;
    if (!nom) return toast("Indiquez le prénom.");
    if (!/^[a-z0-9.-]{3,30}$/.test(ident)) return toast("Identifiant : 3 caractères au moins, lettres, chiffres, point ou tiret.");
    if (S.equipe.some(x => x.identifiant === ident)) return toast("Cet identifiant est déjà pris.");
    const u = { id: prochainUid(), nom, identifiant: ident, poste: champ("poste").value.trim() || PROFILS[role].nom, role, admin: false, actif: true, empreinte: "", depuis: Date.now() };
    S.equipe.push(u); sauver(); f.remove(); rendre(); feuilleInviter(u.id);
  };
}

/* ---------------- L'invitation ----------------
   Le lien porte de quoi accueillir la personne (prénom, identifiant, rôle, entreprise), jamais un mot de passe.
   Il vaut 7 jours. Dans la démo, tout reste dans le navigateur : le lien est lu par l'appareil qui l'ouvre.
   Dans l'appli livrée, c'est le serveur qui vérifie que le lien n'a servi qu'une fois. */
const INVITATION_JOURS = 7;
const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deb64u = s => decodeURIComponent(escape(atob(String(s).replace(/-/g, "+").replace(/_/g, "/"))));
function lienInvitation(u) {
  if (!u.invite || u.invite.x < Date.now()) u.invite = { k: Math.random().toString(36).slice(2, 10), x: Date.now() + INVITATION_JOURS * 86400000, le: Date.now() };
  sauver();
  const d = { v: 1, k: u.invite.k, x: u.invite.x, e: (S.entreprise || {}).nom || "", n: u.nom, i: u.identifiant, p: u.poste || "", r: u.role, a: u.admin ? 1 : 0, m: S.variante || S.metier || "loueur", par: session ? session.nom : "" };
  return adresseDemo() + "#invitation=" + b64u(JSON.stringify(d));
}
function texteInvitation(u, lien) {
  return `Bonjour ${u.nom}, voici votre accès à l'appli de stock de ${nomEntreprise()}. Ouvrez ce lien sur votre téléphone, choisissez votre mot de passe, puis mettez l'appli sur votre écran d'accueil : ${lien}\nLe lien marche ${INVITATION_JOURS} jours.`;
}
async function feuilleInviter(uid) {
  const u = S.equipe.find(x => x.id === uid); if (!u) return;
  // Renvoyer un lien à quelqu'un qui a déjà un mot de passe revient à lui en faire choisir un nouveau : l'ancien cesse de marcher.
  const lien = lienInvitation(u), texte = texteInvitation(u, lien), fin = new Date(u.invite.x).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const f = ouvrirFeuille(`<div role="dialog" aria-modal="true" aria-labelledby="tin"><h1 id="tin" style="font-size:26px">Inviter ${esc(u.nom)}</h1>
    <p class="sous">${esc(u.nom)} ouvre ce lien sur son téléphone, choisit son mot de passe, puis met l'appli sur son écran d'accueil. Aucun mot de passe ne circule.</p>
    <div class="eq-qr"><div data-qr-invitation aria-label="QR code de l'invitation"></div><p><b>À côté de vous ?</b> Faites-lui viser ce QR code avec l'appareil photo de son téléphone.</p></div>
    <div class="eq-envois">
      ${navigator.share ? `<button class="btn plein" data-env="partage">${I.partager}Envoyer le lien</button>` : ""}
      <a class="btn" data-env="wa" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texte)}">WhatsApp</a>
      <a class="btn" data-env="sms" href="sms:?&body=${encodeURIComponent(texte)}">SMS</a>
      <a class="btn" data-env="mel" href="mailto:?subject=${encodeURIComponent("Votre accès à l'appli de stock")}&body=${encodeURIComponent(texte)}">E-mail</a>
      <button class="btn" data-env="copier">Copier le lien</button>
    </div>
    <p class="w-note">Valable jusqu'au ${fin}. ${u.empreinte ? `Tant que ${esc(u.nom)} n'a pas ouvert ce lien, son mot de passe actuel continue de marcher.` : `${esc(u.nom)} ne peut pas entrer avant d'avoir choisi son mot de passe.`}</p>
    <div class="valider" style="grid-template-columns:1fr"><button class="btn" data-x>Fermer</button></div></div>`);
  f.querySelector("[data-x]").onclick = () => f.remove();
  const p = f.querySelector('[data-env="partage"]'); if (p) p.onclick = async () => { try { await navigator.share({ title: "Votre accès à l'appli de stock", text: texte }); } catch (e) { /* partage annulé */ } };
  f.querySelector('[data-env="copier"]').onclick = async () => { if (await copierEssai(lien)) toast("Lien copié."); };
  try { await script("lib/qrcode.js"); const q = window.qrcode(0, "L"); q.addData(lien); q.make(); f.querySelector("[data-qr-invitation]").innerHTML = q.createSvgTag({ cellSize: 3, margin: 2, scalable: true }); }
  catch (e) { f.querySelector(".eq-qr").hidden = true; }
}

/* ---------------- L'arrivée de la personne invitée ---------------- */
let invitation = null; // { d, etape, msg, uid }
const CLE_INVITATION = "stockclair-invitation";
// Sur iPhone, l'appli posée sur l'écran d'accueil ne partage pas la mémoire de Safari, mais elle reçoit ses cookies
// au moment où on l'ajoute. On y garde donc l'invitation acceptée, pour que l'appli installée retrouve la personne.
function ecrireTemoin(v) {
  try { document.cookie = `${CLE_INVITATION}=${v}; max-age=${v ? INVITATION_JOURS * 86400 : 0}; path=${location.pathname.replace(/[^/]*$/, "")}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`; } catch (e) { /* cookies refusés */ }
}
function lireTemoin() {
  try { const m = document.cookie.match(new RegExp("(?:^|; )" + CLE_INVITATION + "=([^;]+)")); return m ? m[1] : ""; } catch (e) { return ""; }
}
function lireInvitation(jeton) {
  // Le lien vient de l'extérieur : on ne garde que des textes courts, un identifiant bien formé et un rôle connu.
  try {
    const d = JSON.parse(deb64u(jeton)), txt = (v, n) => typeof v === "string" ? v.slice(0, n) : "";
    if (!d || d.v !== 1 || !PROFILS[d.r] || !/^[a-z0-9.-]{3,30}$/.test(d.i) || !txt(d.n, 30).trim() || typeof d.x !== "number") return null;
    return { v: 1, k: txt(d.k, 16), x: d.x, e: txt(d.e, 60), n: txt(d.n, 30).trim(), i: d.i, p: txt(d.p, 40), r: d.r, a: d.a ? 1 : 0, m: txt(d.m, 30), par: txt(d.par, 30) };
  } catch (e) { return null; }
}
// Place la personne dans l'équipe de cet appareil (démo) : l'entreprise et le métier suivent l'invitation.
function accueillirInvite(d) {
  if (METIERS[d.m] && !S.monEssai && !S.equipe.some(x => x.identifiant === d.i) && (S.variante || S.metier || "loueur") !== d.m) { const garder = { monnaie: S.monnaie }; S = construireDemo(d.m); Object.assign(S, garder); }
  if (d.e && !S.monEssai) S.entreprise = Object.assign({}, S.entreprise, { nom: d.e });
  let u = S.equipe.find(x => x.identifiant === d.i);
  if (!u) { u = { id: prochainUid(), nom: d.n, identifiant: d.i, poste: d.p || PROFILS[d.r].nom, role: d.r, admin: !!d.a, actif: true, empreinte: "", depuis: Date.now() }; S.equipe.push(u); }
  return u;
}
function demarrerInvitation() {
  const m = location.hash.match(/^#invitation=([A-Za-z0-9_-]+)$/);
  if (m) {
    const d = lireInvitation(m[1]);
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* adresse laissée telle quelle */ }
    if (!d) { msgConnexion = "Ce lien d'invitation est incomplet. Demandez-en un nouveau à votre responsable."; return; }
    session = null; installateur = false;
    const u = S.equipe.find(x => x.identifiant === d.i);
    // Sur l'appareil d'où part l'invitation, un lien remplacé par un plus récent ne marche plus.
    const remplace = u && u.invite && u.invite.k !== d.k, dejaServi = u && u.inviteVue === d.k;
    invitation = { d, etape: d.x < Date.now() || remplace ? "perime" : dejaServi ? "servi" : "mdp", msg: "" };
    return;
  }
  // Appli ouverte depuis l'écran d'accueil d'un iPhone : on retrouve l'invitation acceptée dans Safari.
  const t = lireTemoin(); if (!t) return;
  const [jeton, emp] = t.split("."), d = lireInvitation(jeton);
  if (d && emp && d.x > Date.now()) {
    let u = S.equipe.find(x => x.identifiant === d.i);
    if (!u || !u.empreinte) { u = accueillirInvite(d); u.empreinte = emp; delete u.invite; sauver(); }
    try { if (!localStorage.getItem(CLE_IDENT)) localStorage.setItem(CLE_IDENT, d.i); } catch (e) { /* stockage bloqué */ }
  }
}
// Navigateurs ouverts à l'intérieur d'une autre appli (Facebook, Instagram…) : ils ne savent pas poser l'appli sur l'écran d'accueil.
const navigateurInterne = () => /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok/i.test(navigator.userAgent);
function pasInstallation() {
  const ua = navigator.userAgent, iphone = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1), android = /Android/.test(ua);
  const pas = l => `<ol class="pas-accueil">${l.map(x => `<li>${x}</li>`).join("")}</ol>`;
  const iph = pas(["Touchez le bouton <b>Partager</b> de Safari (un carré avec une flèche vers le haut).", "Choisissez <b>« Sur l'écran d'accueil »</b>.", "Touchez <b>« Ajouter »</b>. L'icône Stockclair apparaît avec vos autres applis."]);
  const andr = pas(["Touchez le menu <b>⋮</b> de Chrome, en haut à droite.", "Choisissez <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>.", "Validez. L'icône Stockclair apparaît avec vos autres applis."]);
  const ordi = pas(["Dans <b>Chrome</b> ou <b>Edge</b>, cliquez sur l'icône d'installation, au bout de la barre d'adresse.", "Ou ouvrez le menu, puis <b>« Installer Stockclair »</b>."]);
  const interne = navigateurInterne() ? `<p class="eq-avert">Cette page est ouverte à l'intérieur d'une autre appli. Ouvrez-la d'abord dans ${iphone ? "Safari" : "Chrome"} : touchez le menu, puis « Ouvrir dans le navigateur ».</p>` : "";
  return interne + (iphone ? iph : android ? andr : `<h2>Sur un téléphone Android</h2>${andr}<h2>Sur un iPhone</h2>${iph}<h2>Sur un ordinateur</h2>${ordi}`);
}
function vInvitation() {
  const d = invitation.d, e = invitation.etape, fin = new Date(d.x).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const tete = `<div class="barre"><div class="marque">${I.logo}<span>${esc(d.e || "Stockclair")}</span></div>${boutonReglages}</div>`;
  const faux = { nom: d.n, role: d.r };
  if (e === "perime" || e === "servi") return `${DEMO}<div class="connexion">${tete}
    <div class="c-tete"><h1>${e === "servi" ? "Votre accès existe déjà" : "Ce lien ne marche plus"}</h1><p class="sous">${e === "servi" ? "Cette invitation a déjà servi. Entrez avec votre identifiant et votre mot de passe." : `Une invitation vaut ${INVITATION_JOURS} jours, et seul le dernier lien envoyé marche. Demandez-en un nouveau${d.par ? " à " + esc(d.par) : ""}.`}</p></div>
    <button class="btn plein" data-invitation="connexion">Aller à l'écran de connexion</button></div>`;
  if (e === "installer") return `${DEMO}<div class="connexion">${tete}
    <div class="c-tete"><p class="eq-etape">Étape 2 sur 2</p><h1>Mettez l'appli sur votre téléphone</h1><p class="sous">Une icône sur l'écran d'accueil, comme vos autres applis. Elle s'ouvre en plein écran et continue sans réseau. Rien à chercher dans un magasin d'applications.</p></div>
    <div class="c-form verre eq-installer">
      ${inviteInstall ? `<button class="btn plein" data-invitation="installer">${I.telecharger}Installer l'appli</button><p class="w-note">Un seul geste. Si rien ne se passe, suivez les étapes ci-dessous.</p>` : ""}
      ${pasInstallation()}
    </div>
    <div class="valider" style="grid-template-columns:1fr"><button class="btn ${inviteInstall ? "" : "plein"}" data-invitation="entrer">C'est fait, entrer dans l'appli</button></div>
    <p class="c-pied"><button class="lien" data-invitation="entrer">Plus tard</button></p></div>`;
  return `${DEMO}<div class="connexion">${tete}
    <div class="c-tete centre">${avatar(faux, true)}<p class="eq-etape">Étape 1 sur 2</p><h1>Bienvenue ${esc(d.n)}</h1><p class="sous">${d.par ? esc(d.par) + " vous ouvre" : "Voici"} l'accès à l'appli de stock${d.e ? " de " + esc(d.e) : ""}. Choisissez votre mot de passe : vous seul le connaîtrez.</p></div>
    <form class="c-form verre" data-form="invitation">
      <p class="eq-ident">Votre identifiant<b class="code">${esc(d.i)}</b></p>
      <label class="champ">Mot de passe, 6 caractères au moins${champMdp("new-password")}</label>
      <label class="champ">Le même, une seconde fois<input name="mdp2" type="password" autocomplete="new-password" required></label>
      <p class="message" role="alert">${esc(invitation.msg)}</p>
      <button class="btn plein">Créer mon accès</button>
    </form>
    <p class="c-pied">Ce lien marche jusqu'au ${fin}.</p></div>`;
}
function accepterInvitation(f) {
  const d = invitation.d, mdp = f.mdp.value, mdp2 = f.mdp2.value;
  const refus = mdp.length < 6 ? "Le mot de passe fait 6 caractères au moins." : mdp !== mdp2 ? "Les deux mots de passe ne sont pas pareils." : MDP_FAIBLES.includes(mdp.toLowerCase()) || mdp.toLowerCase().includes(d.i) ? "Mot de passe trop facile à deviner." : "";
  if (refus) { invitation.msg = refus; return rendre(); }
  const u = accueillirInvite(d);
  u.empreinte = empreinte(u.id, mdp); u.actif = true; delete u.invite; u.inviteVue = d.k; if (!u.depuis) u.depuis = Date.now();
  S.connexions.unshift({ date: Date.now(), uid: u.id, nom: u.nom, ok: true, motif: "Invitation acceptée" }); S.connexions = S.connexions.slice(0, 200);
  sauver();
  try { localStorage.setItem(CLE_IDENT, d.i); } catch (e) { /* stockage bloqué */ }
  ecrireTemoin(b64u(JSON.stringify(d)) + "." + u.empreinte);
  invitation.uid = u.id; invitation.msg = "";
  if (dejaInstallee()) return finirInvitation();
  invitation.etape = "installer"; rendre(); window.scrollTo(0, 0);
}
function finirInvitation() {
  const u = invitation && S.equipe.find(x => x.id === invitation.uid);
  invitation = null;
  if (u) { ouvrirSession(u); toast(`Bienvenue ${u.nom}. Ajoutez votre photo depuis votre fiche.`); } else rendre();
}

/* ---------------- Branchements propres à ce fichier ---------------- */
function brancherEquipe() {
  $$("[data-personne]").forEach(b => b.onclick = () => { nFiche = 30; aller("personne", b.dataset.personne); });
  $$("[data-onglet-eq]").forEach(b => b.onclick = () => { ongletEq = b.dataset.ongletEq; rendre(); const n = $(`[data-onglet-eq="${ongletEq}"]`); if (n) n.focus({ preventScroll: true }); });
  $$("[data-onglet-accueil]").forEach(b => b.onclick = () => { ongletAccueil = b.dataset.ongletAccueil; entree = true; toutVoir = false; rendre(); const n = $(`[data-onglet-accueil="${ongletAccueil}"]`); if (n) n.focus({ preventScroll: true }); });
  $$("[data-periode-fiche]").forEach(b => b.onclick = () => { periodeFiche = +b.dataset.periodeFiche; nFiche = 30; entree = true; rendre(); const n = $(`[data-periode-fiche="${periodeFiche}"]`); if (n) n.focus({ preventScroll: true }); });
  $$("[data-plus-fiche]").forEach(b => b.onclick = () => { nFiche += 30; rendre(); });
  $$("[data-photo]").forEach(b => b.onclick = () => feuillePhoto());
  $$("[data-retirer-photo]").forEach(b => b.onclick = () => { const u = S.equipe.find(x => x.id === b.dataset.retirerPhoto); if (!u || !confirm(`Retirer la photo de ${u.nom} ?`)) return; delete u.photo; sauver(); rendre(); toast("Photo retirée."); });
  $$("[data-inviter]").forEach(b => b.onclick = () => feuilleInviter(b.dataset.inviter));
  $$("[data-export-fiche]").forEach(b => b.onclick = () => exporterFiche(b.dataset.exportFiche));
  const fi = $('[data-form="invitation"]'); if (fi) fi.onsubmit = e => { e.preventDefault(); accepterInvitation(fi); };
  $$("[data-invitation]").forEach(b => b.onclick = async () => {
    const a = b.dataset.invitation;
    if (a === "connexion") { identSaisi = invitation.d.i; invitation = null; rendre(); }
    else if (a === "entrer") finirInvitation();
    else if (a === "installer" && inviteInstall) { const i = inviteInstall; inviteInstall = null; i.prompt(); try { const c = await i.userChoice; if (c && c.outcome === "accepted") return finirInvitation(); } catch (e) { /* invite fermée */ } rendre(); }
  });
}
