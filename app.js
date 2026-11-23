(function () {
  "use strict";
  var CFG = window.CONFIG || {};
  var KEY = "mb.v1";
  var $view = document.getElementById("view");
  var $title = document.getElementById("title");
  var $back = document.getElementById("backBtn");
  var $me = document.getElementById("meBtn");

  /* ---------- Oturum ---------- */
  var S = (function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  function saveS() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function logout() { S = {}; try { localStorage.removeItem(KEY); } catch (e) {} PC = {}; location.hash = "#/login"; }

  /* ---------- Yardımcılar ---------- */
  function esc(t) { return String(t === null || t === undefined ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function bar(p, ok) { return '<div class="bar' + (ok ? " ok" : "") + '"><i style="width:' + Math.max(0, Math.min(100, Math.round(p))) + '%"></i></div>'; }

  /** Çok basit biçimlendirme: # başlık, ## alt başlık, - madde, 1. numaralı madde, **kalın** */
  function md(text) {
    var lines = String(text || "").split(/\r?\n/), out = [], list = "";
    function inline(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
    function close() { if (list) { out.push("</" + list + ">"); list = ""; } }
    lines.forEach(function (ln) {
      var t = ln.trim(), m;
      if ((m = t.match(/^[-•*]\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push("<li>" + inline(m[1]) + "</li>"); return; }
      if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol start=\"" + m[0].match(/^\d+/)[0] + "\">"); list = "ol"; } out.push("<li>" + inline(m[1]) + "</li>"); return; }
      close();
      if ((m = t.match(/^(#{1,2})\s+(.*)$/))) out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">");
      else if (t) out.push("<p>" + inline(t) + "</p>");
    });
    close();
    return out.join("");
  }
  /** Görsel listesi: her satır bir adres (img/dosya.jpg veya https://...) */
  function imgs(text) {
    return String(text || "").split(/\r?\n/).map(function (x) { return x.trim(); })
      .filter(function (x) { return /^(img\/[\w.\-]+|https?:\/\/\S+)\.(jpe?g|png|webp|gif)(\?\S*)?$/i.test(x); });
  }
  function parseVideo(u) {
    u = String(u || "").trim();
    var m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    if (m) return { t: "yt", id: m[1] };
    m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
    if (m) return { t: "drive", id: m[1] };
    if (/^https?:\/\//.test(u)) return { t: "link", url: u };
    return { t: "none" };
  }
  /** İzlenen gerçek süreyi sayar. Atlama (seek) yapılan kısımlar sayılmaz. */
  function makeTracker(duration) {
    var watched = 0, last = null;
    return {
      tick: function (cur, playing, rate) {
        if (!playing) { last = cur; return duration ? watched / duration : 0; }
        if (last !== null) { var d = cur - last; if (d > 0 && d <= 2.5 * (rate || 1)) watched += d; }
        last = cur;
        return duration ? watched / duration : 0;
      },
      setDuration: function (d) { duration = d; },
      seconds: function () { return watched; }
    };
  }
  window.__MB = { makeTracker: makeTracker, parseVideo: parseVideo, md: md, imgs: imgs };

  /* ---------- Sunucu çağrıları ---------- */
  function api(action, data) {
    var body = { action: action, token: S.token };
    for (var k in data) body[k] = data[k];
    var p;
    if (CFG.API_URL) {
      p = fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); });
    } else if (window.demoApi) {
      p = window.demoApi(body);
    } else {
      return Promise.reject(new Error("Sunucu adresi ayarlanmamış (config.js içinde API_URL)."));
    }
    return p.catch(function () { throw new Error("Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin."); })
      .then(function (r) {
        if (!r.ok) {
          if (/Oturum|Hesap bulunamadı/.test(r.hata || "") && action !== "login") { S = {}; saveS(); location.hash = "#/login"; }
          throw new Error(r.hata || "Bir hata oluştu.");
        }
        return r.data;
      });
  }
  var PC = {}; // pratik önbelleği
  function getPratik(id, force) {
    if (PC[id] && !force) return Promise.resolve(PC[id]);
    return api("pratik", { id: id }).then(function (d) { PC[id] = d; return d; });
  }

  /* ---------- Yönlendirme ---------- */
  var routes = [], cleanup = null, renderId = 0;
  function route(re, fn) { routes.push({ re: re, fn: fn }); }
  function go() {
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    var h = location.hash.replace(/^#/, "") || "/home";
    if (!S.token && h !== "/login") { location.hash = "#/login"; return; }
    if (S.token && S.ogr && S.ogr.degistirmeli && h !== "/sifre") { location.hash = "#/sifre"; return; }
    for (var i = 0; i < routes.length; i++) {
      var m = h.match(routes[i].re);
      if (!m) continue;
      var my = ++renderId;
      $view.innerHTML = '<div class="spin">Yükleniyor…</div>';
      Promise.resolve(routes[i].fn.apply(null, m.slice(1))).then(function (res) {
        if (my !== renderId) return;
        $view.innerHTML = res.html;
        $title.textContent = res.title || CFG.UYGULAMA;
        document.title = $title.textContent;
        $back.hidden = !res.back; $back.dataset.to = res.back || "";
        $me.hidden = !S.token;
        window.scrollTo(0, 0);
        if (res.after) cleanup = res.after() || null;
      }).catch(function (e) {
        if (my !== renderId) return;
        $view.innerHTML = '<div class="card"><div class="err">' + esc(e.message) + '</div><button class="primary" id="rt">Tekrar dene</button><a class="ghost" href="#/home">Ana sayfa</a></div>';
        document.getElementById("rt").onclick = go;
      });
      return;
    }
    location.hash = "#/home";
  }
  $back.addEventListener("click", function () { if ($back.dataset.to) location.hash = $back.dataset.to; else history.back(); });
  $me.addEventListener("click", function () { location.hash = "#/hesap"; });
  window.addEventListener("hashchange", go);

  /* ---------- Giriş ---------- */
  route(/^\/login$/, function () {
    return {
      title: CFG.UYGULAMA, html:
        '<div class="hero"><h2>' + esc(CFG.UYGULAMA) + '</h2><p>' + esc(CFG.KURUM) + '</p></div>' +
        '<div class="card"><form id="lf" autocomplete="on">' +
        '<label class="f" for="no">Okul numarası</label><input id="no" type="text" inputmode="text" autocomplete="username" autocapitalize="off" autocorrect="off">' +
        '<label class="f" for="pw">Şifre</label><div class="pw"><input id="pw" type="password" autocomplete="current-password"><button type="button" id="eye" aria-label="Şifreyi göster">👁</button></div>' +
        '<div id="msg"></div><button class="primary" id="lb" type="submit">Giriş yap</button></form>' +
        '<div class="note">' + esc(CFG.ILK_SIFRE_NOTU) + '</div></div>',
      after: function () {
        $me.hidden = true;
        document.getElementById("eye").onclick = function () { var p = document.getElementById("pw"); p.type = p.type === "password" ? "text" : "password"; };
        document.getElementById("lf").onsubmit = function (e) {
          e.preventDefault();
          var b = document.getElementById("lb"), msg = document.getElementById("msg");
          b.disabled = true; b.textContent = "Giriş yapılıyor…"; msg.innerHTML = "";
          api("login", { no: document.getElementById("no").value.trim(), sifre: document.getElementById("pw").value }).then(function (d) {
            S = { token: d.token, ogr: d.ogrenci }; saveS(); PC = {};
            location.hash = d.ogrenci.degistirmeli ? "#/sifre" : "#/home";
          }).catch(function (er) { msg.innerHTML = '<div class="err">' + esc(er.message) + '</div>'; b.disabled = false; b.textContent = "Giriş yap"; });
        };
      }
    };
  });

  route(/^\/sifre$/, function () {
    var zorunlu = S.ogr && S.ogr.degistirmeli;
    return {
      title: "Şifre değiştir", back: zorunlu ? "" : "#/hesap", html:
        '<div class="card">' + (zorunlu ? '<div class="note" style="margin:0 0 8px">Güvenliğiniz için ilk girişte şifrenizi değiştirmeniz gerekiyor.</div>' : "") +
        '<form id="sf"><label class="f" for="o">Mevcut şifre</label><input id="o" type="password" autocomplete="current-password">' +
        '<label class="f" for="n">Yeni şifre (en az 6 karakter)</label><input id="n" type="password" autocomplete="new-password">' +
        '<label class="f" for="n2">Yeni şifre (tekrar)</label><input id="n2" type="password" autocomplete="new-password">' +
        '<div id="msg"></div><button class="primary" id="sb" type="submit">Şifreyi kaydet</button></form></div>',
      after: function () {
        document.getElementById("sf").onsubmit = function (e) {
          e.preventDefault();
          var msg = document.getElementById("msg"), n = document.getElementById("n").value;
          if (n !== document.getElementById("n2").value) { msg.innerHTML = '<div class="err">Yeni şifreler aynı değil.</div>'; return; }
          var b = document.getElementById("sb"); b.disabled = true;
          api("sifre", { eski: document.getElementById("o").value, yeni: n }).then(function (d) {
            S.ogr = d.ogrenci; saveS(); location.hash = "#/home";
          }).catch(function (er) { msg.innerHTML = '<div class="err">' + esc(er.message) + '</div>'; b.disabled = false; });
        };
      }
    };
  });

  route(/^\/hesap$/, function () {
    var o = S.ogr || {};
    return {
      title: "Hesabım", back: "#/home", html:
        '<div class="card"><h3>' + esc(o.ad) + '</h3><p class="mute">Okul no: ' + esc(o.no) + '<br>Dönem ' + esc(o.donem) + ' · ' + esc(o.kurul) + '</p></div>' +
        '<a class="ghost" href="#/sifre">Şifremi değiştir</a><button class="ghost" id="lo">Çıkış yap</button>',
      after: function () { document.getElementById("lo").onclick = logout; }
    };
  });

  /* ---------- Ana sayfa: öğrencinin kurulundaki pratikler ---------- */
  route(/^\/home$/, function () {
    return api("ana", {}).then(function (d) {
      S.ogr = d.ogrenci; saveS();
      var o = d.ogrenci, h = '<div class="hero"><h2>Merhaba, ' + esc(o.ad.split(" ")[0]) + '</h2><p>Dönem ' + esc(o.donem) + ' · ' + esc(o.kurul) + '</p></div>';
      h += '<p class="mute">Pratiğe katılmak için her pratiğin metin ve videolarını tamamlayıp sonundaki testi çözmeniz gerekir. Test puanı katılımınızı etkilemez.</p>';
      if (!d.pratikler.length) h += '<div class="card">Kurulunuz için henüz pratik tanımlanmamış.</div>';
      d.pratikler.forEach(function (p) {
        var adim = p.icerikToplam + 1, yapilan = p.icerikTamam + (p.testYapildi ? 1 : 0), pct = adim ? yapilan / adim * 100 : 0;
        h += '<a class="pcard" href="#/p/' + esc(p.id) + '"><b>' + esc(p.ad) + '</b><div class="d">' + esc(p.tarih || p.aciklama) + '</div>' + bar(p.tamamlandi ? 100 : pct, p.tamamlandi) +
          (p.tamamlandi ? '<span class="badge ok">✔ Pratiğe girebilirsiniz</span>' : '<span class="badge no">Eksik adım var</span>') + '</a>';
      });
      return { title: CFG.UYGULAMA, html: h };
    });
  });

  /* ---------- Pratik sayfası ---------- */
  var IC = { metin: "📖", video: "🎬", dosya: "📎", resim: "🖼️" };
  route(/^\/p\/([\w-]+)$/, function (id) {
    return getPratik(id, true).then(function (d) {
      var p = d.pratik, h = '<div class="card"><h3>' + esc(p.ad) + '</h3><p class="mute" style="margin:0">' + esc(p.aciklama) + '</p>' + (p.tarih ? '<p class="mute" style="margin:6px 0 0">' + esc(p.tarih) + '</p>' : "") + '</div>';
      d.icerik.forEach(function (c) {
        h += '<a class="step" href="#/p/' + esc(id) + '/c/' + c.sira + '"><span class="ic">' + (IC[c.tur] || "📄") + '</span><span class="tx"><b>' + esc(c.baslik) + '</b><small>' + ({ metin: "Okuma", video: "Video", dosya: "Dosya", resim: "Ders notu sayfaları" }[c.tur] || "İçerik") + '</small></span><span class="st">' + (c.tamam ? "✅" : "▫️") + '</span></a>';
      });
      if (d.soruSayisi > 0) {
        var kilit = !d.testAcik;
        h += '<a class="step' + (kilit ? " lock" : "") + '" href="' + (kilit ? "javascript:void(0)" : "#/p/" + esc(id) + "/test") + '"><span class="ic">📝</span><span class="tx"><b>Değerlendirme testi</b><small>' +
          (kilit ? "Önce tüm içerikleri tamamlayın" : d.testYapildi ? "Son sonuç: " + d.testPuan + "/" + d.testToplam + " (tekrar çözebilirsiniz)" : d.soruSayisi + " soru") + '</small></span><span class="st">' + (kilit ? "🔒" : d.testYapildi ? "✅" : "▫️") + '</span></a>';
      }
      if (d.tamamlandi) {
        h += '<div class="status ok"><b>✔ Pratiğe katılabilirsiniz</b>Teorik eğitimi tamamladınız.</div><a class="primary" style="display:block;text-align:center;text-decoration:none;padding:14px;border-radius:12px;background:var(--ok);color:#fff;font-weight:600" href="#/p/' + esc(id) + '/giris">Giriş kartımı göster</a>';
      } else {
        var kalan = d.icerik.filter(function (c) { return !c.tamam; }).length + (d.soruSayisi > 0 && !d.testYapildi ? 1 : 0);
        h += '<div class="status no"><b>Henüz pratiğe giremezsiniz</b>Tamamlanması gereken ' + kalan + ' adım kaldı.</div>';
      }
      return { title: p.ad, back: "#/home", html: h };
    });
  });

  /* ---------- Giriş kartı (pratik kapısında gösterilir) ---------- */
  route(/^\/p\/([\w-]+)\/giris$/, function (id) {
    return getPratik(id, true).then(function (d) {
      if (!d.tamamlandi) return { title: "Giriş kartı", back: "#/p/" + id, html: '<div class="status no"><b>Henüz tamamlanmadı</b>Pratiğe girebilmek için tüm adımları bitirin.</div>' };
      var o = S.ogr || {};
      return {
        title: "Giriş kartı", back: "#/p/" + id, html:
          '<div class="pass"><div class="big">✔ PRATİĞE GİREBİLİR</div><div class="nm">' + esc(o.ad) + '</div><div class="mute" style="margin:4px 0">Okul no: ' + esc(o.no) + ' · Dönem ' + esc(o.donem) + ' · ' + esc(o.kurul) + '</div>' +
          '<h3>' + esc(d.pratik.ad) + '</h3><div class="mute">' + esc(d.pratik.tarih) + '</div>' +
          '<div class="mute" style="margin-top:8px">Teorik eğitim tamamlandı: ' + esc(new Date(d.tamamTarihi).toLocaleString("tr-TR")) + '</div><div class="clock" id="ck"></div></div>' +
          '<p class="mute center" style="margin-top:12px">Bu ekran canlı saat gösterir. Ekran görüntüsü geçerli sayılmaz.</p>',
        after: function () {
          function t() { var e = document.getElementById("ck"); if (e) e.textContent = new Date().toLocaleTimeString("tr-TR"); }
          t(); var iv = setInterval(t, 1000); return function () { clearInterval(iv); };
        }
      };
    });
  });

  /* ---------- İçerik: metin / video / dosya ---------- */
  var YTP = null; // YouTube API yükleme sözü
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (YTP) return YTP;
    YTP = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.onerror = rej;
      window.onYouTubeIframeAPIReady = res; document.head.appendChild(s);
      setTimeout(rej, 8000);
    });
    return YTP;
  }

  route(/^\/p\/([\w-]+)\/c\/(\d+)$/, function (id, sira) {
    return getPratik(id).then(function (d) {
      sira = Number(sira);
      var idx = -1; d.icerik.forEach(function (c, i) { if (c.sira === sira) idx = i; });
      if (idx < 0) throw new Error("İçerik bulunamadı.");
      var c = d.icerik[idx], next = d.icerik[idx + 1];
      var nextHref = next ? "#/p/" + id + "/c/" + next.sira : (d.soruSayisi > 0 ? "#/p/" + id + "/test" : "#/p/" + id);
      var nextTxt = next ? "Sonraki adım ›" : (d.soruSayisi > 0 ? "Teste geç ›" : "Pratik sayfasına dön");
      var head = '<p class="mute">Adım ' + (idx + 1) + ' / ' + d.icerik.length + '</p>';
      var foot = '<div id="fb"></div><button class="primary" id="done" disabled></button><a class="ghost" href="#/p/' + esc(id) + '">Pratik sayfasına dön</a>';
      var body, setup;

      function markDone() {
        if (c.tamam) return Promise.resolve();
        return api("tamam", { id: id, sira: sira }).then(function (r) {
          c.tamam = true; d.testAcik = r.testAcik; d.tamamlandi = r.tamamlandi;
        });
      }
      function enableNext(btn) {
        btn.disabled = false; btn.textContent = "✅ Tamamlandı. " + nextTxt;
        btn.onclick = function () { location.hash = nextHref; };
      }
      /** Süre dolunca "tamamlandı" düğmesini açan sayaç (metin ve takip edilemeyen içerik) */
      function timedComplete(btn, sn, label) {
        if (c.tamam) { enableNext(btn); return null; }
        var left = sn, iv = setInterval(function () {
          left--; if (left > 0) { btn.textContent = label + " (" + left + " sn)"; return; }
          clearInterval(iv); btn.disabled = false; btn.textContent = "Okudum / izledim, tamamla";
          btn.onclick = function () { btn.disabled = true; btn.textContent = "Kaydediliyor…"; markDone().then(function () { enableNext(btn); }).catch(function (e) { btn.disabled = false; btn.textContent = "Tekrar dene"; document.getElementById("fb").innerHTML = '<div class="err">' + esc(e.message) + '</div>'; }); };
        }, 1000);
        btn.textContent = label + " (" + left + " sn)";
        return function () { clearInterval(iv); };
      }

      if (c.tur === "metin") {
        var words = c.icerik.split(/\s+/).length, sn = Math.max(CFG.METIN_MIN_SN || 8, Math.min(45, Math.round(words / 8)));
        body = '<div class="card txt">' + md(c.icerik) + '</div>';
        setup = function () { return timedComplete(document.getElementById("done"), sn, "Okuyun"); };
      } else if (c.tur === "resim") {
        var im = imgs(c.icerik), snR = Math.min(60, 10 + 4 * im.length);
        body = im.length
          ? '<p class="mute">Sayfalara dokunarak büyütebilirsiniz.</p>' + im.map(function (u) { return '<a href="' + esc((window.__DEMO_IMG && window.__DEMO_IMG[u]) || u) + '" target="_blank" rel="noopener"><img class="pg" loading="lazy" src="' + esc((window.__DEMO_IMG && window.__DEMO_IMG[u]) || u) + '" alt="Ders notu sayfası"></a>'; }).join("")
          : '<div class="card">Görsel bulunamadı.</div>';
        setup = function () { return timedComplete(document.getElementById("done"), snR, "İnceleyin"); };
      } else if (c.tur === "dosya") {
        var v0 = parseVideo(c.icerik);
        body = '<div class="card"><h3>' + esc(c.baslik) + '</h3>' + (v0.t === "link" || v0.t === "drive" ? '<a class="ghost" target="_blank" rel="noopener" href="' + esc(v0.url || ("https://drive.google.com/file/d/" + v0.id + "/view")) + '">Dosyayı aç ↗</a>' : '<p class="mute">Dosya bağlantısı eklenmemiş.</p>') + '</div>';
        setup = function () { return timedComplete(document.getElementById("done"), 15, "İnceleyin"); };
      } else {
        var v = parseVideo(c.icerik);
        if (v.t === "yt") {
          body = '<div class="vid"><div id="yt"></div></div><div class="card" style="margin-top:12px"><div class="mute" id="vp">Videoyu sonuna kadar izleyin. İlerleme otomatik kaydedilir.</div>' + bar(0) + '</div>';
          setup = function () {
            var btn = document.getElementById("done"), stopped = false, iv = null, player = null;
            if (c.tamam) { enableNext(btn); } else btn.textContent = "Videoyu izleyin";
            function fallback() {
              if (stopped) return;
              document.getElementById("yt").outerHTML = '<iframe src="https://www.youtube.com/embed/' + v.id + '?rel=0" allowfullscreen></iframe>';
              document.getElementById("vp").textContent = "Oynatıcı takibi kullanılamıyor. Videoyu izleyin, ardından düğme açılacak.";
              fbTimer = timedComplete(btn, CFG.DIGER_MIN_SN || 30, "İzleyin");
            }
            var fbTimer = null;
            loadYT().then(function () {
              if (stopped) return;
              var tr = makeTracker(0), esik = CFG.VIDEO_ESIK || 0.9;
              player = new window.YT.Player("yt", { videoId: v.id, playerVars: { rel: 0, modestbranding: 1, playsinline: 1 }, events: {
                onReady: function () { tr.setDuration(player.getDuration()); },
                onStateChange: function () {}
              } });
              iv = setInterval(function () {
                if (!player || !player.getCurrentTime) return;
                var dur = player.getDuration(); if (dur) tr.setDuration(dur);
                var playing = player.getPlayerState && player.getPlayerState() === 1;
                var p = tr.tick(player.getCurrentTime(), playing, player.getPlaybackRate ? player.getPlaybackRate() : 1);
                var pb = $view.querySelector(".card .bar i"); if (pb) pb.style.width = Math.min(100, Math.round(p / esik * 100)) + "%";
                var vp = document.getElementById("vp"); if (vp && !c.tamam) vp.textContent = "İzlenen: %" + Math.min(100, Math.round(p * 100)) + " (en az %" + Math.round(esik * 100) + " gerekli)";
                if (p >= esik && !c.tamam) {
                  clearInterval(iv); iv = null;
                  var save = function () {
                    btn.disabled = true; btn.textContent = "Kaydediliyor…";
                    markDone().then(function () { enableNext(btn); document.getElementById("fb").innerHTML = ""; if (vp) vp.textContent = "Video izlendi ✔"; })
                      .catch(function (e) { document.getElementById("fb").innerHTML = '<div class="err">' + esc(e.message) + '</div>'; btn.disabled = false; btn.textContent = "Kaydı tekrar dene"; btn.onclick = save; });
                  };
                  save();
                }
              }, 1000);
            }).catch(fallback);
            return function () { stopped = true; if (iv) clearInterval(iv); if (fbTimer) fbTimer(); try { if (player && player.destroy) player.destroy(); } catch (e) {} };
          };
        } else if (v.t === "drive") {
          body = '<div class="vid"><iframe src="https://drive.google.com/file/d/' + esc(v.id) + '/preview" allow="autoplay" allowfullscreen></iframe></div><p class="mute" style="margin-top:8px">Videoyu izleyin; süre dolunca düğme açılır.</p>';
          setup = function () { return timedComplete(document.getElementById("done"), CFG.DIGER_MIN_SN || 30, "İzleyin"); };
        } else if (v.t === "link") {
          body = '<div class="card"><h3>' + esc(c.baslik) + '</h3><a class="ghost" target="_blank" rel="noopener" href="' + esc(v.url) + '">Videoyu aç ↗</a></div>';
          setup = function () { return timedComplete(document.getElementById("done"), CFG.DIGER_MIN_SN || 30, "İzleyin"); };
        } else {
          body = '<div class="card"><h3>' + esc(c.baslik) + '</h3><p class="mute">Bu adım için video henüz eklenmemiş.</p></div>';
          setup = function () { return timedComplete(document.getElementById("done"), 5, "Bekleyin"); };
        }
      }
      return { title: c.baslik, back: "#/p/" + id, html: head + body + foot, after: setup };
    });
  });

  /* ---------- Test ---------- */
  var quiz = null;
  route(/^\/p\/([\w-]+)\/test$/, function (id) {
    return api("testal", { id: id }).then(function (d) {
      if (!d.sorular.length) throw new Error("Bu pratik için soru tanımlı değil.");
      quiz = { id: id, sorular: d.sorular, cev: {}, i: 0 };
      return renderQ();
    });
  });
  function renderQ() {
    var q = quiz.sorular[quiz.i], n = quiz.sorular.length;
    var h = '<div class="note" style="margin:0 0 10px">Test puanı pratiğe katılımınızı etkilemez; öğrenmenizi ölçmek içindir.</div>' +
      '<p class="mute">Soru ' + (quiz.i + 1) + ' / ' + n + '</p>' + bar(quiz.i / n * 100) +
      '<div class="card" style="margin-top:12px"><h3>' + esc(q.soru) + '</h3>' +
      ["A", "B", "C", "D"].filter(function (k) { return q.secenekler[k]; }).map(function (k) { return '<button class="choice' + (quiz.cev[q.i] === k ? " sel" : "") + '" data-k="' + k + '"><b>' + k + ")</b> " + esc(q.secenekler[k]) + '</button>'; }).join("") +
      '<button class="primary" id="nx" ' + (quiz.cev[q.i] ? "" : "disabled") + '>' + (quiz.i + 1 < n ? "Sonraki soru" : "Testi bitir") + '</button>' +
      (quiz.i > 0 ? '<button class="ghost" id="pv">‹ Önceki</button>' : "") + '<div id="msg"></div></div>';
    return {
      title: "Değerlendirme testi", back: "#/p/" + quiz.id, html: h, after: function () {
        document.querySelectorAll(".choice").forEach(function (b) { b.onclick = function () { quiz.cev[q.i] = b.dataset.k; document.querySelectorAll(".choice").forEach(function (x) { x.classList.toggle("sel", x === b); }); document.getElementById("nx").disabled = false; }; });
        var pv = document.getElementById("pv"); if (pv) pv.onclick = function () { quiz.i--; show(renderQ()); };
        document.getElementById("nx").onclick = function () {
          if (quiz.i + 1 < n) { quiz.i++; show(renderQ()); return; }
          var b = this; b.disabled = true; b.textContent = "Gönderiliyor…";
          api("test", { id: quiz.id, cevaplar: quiz.cev }).then(function (r) { delete PC[quiz.id]; show(renderResult(r)); })
            .catch(function (e) { document.getElementById("msg").innerHTML = '<div class="err">' + esc(e.message) + '</div>'; b.disabled = false; b.textContent = "Testi bitir"; });
        };
      }
    };
  }
  function renderResult(r) {
    var id = quiz.id, h = '<div class="card center"><div style="font-size:40px;font-weight:800">' + r.puan + '/' + r.toplam + '</div><p class="mute">Testi tamamladınız. Pratiğe katılım koşulunu sağladınız.</p></div>';
    r.detay.forEach(function (x) {
      var q = quiz.sorular[x.i];
      h += '<div class="card"><b>' + (x.i + 1) + '. ' + esc(q.soru) + '</b>' +
        ["A", "B", "C", "D"].filter(function (k) { return q.secenekler[k]; }).map(function (k) { return '<div class="choice ' + (k === x.dogru ? "right" : k === x.verilen ? "wrong" : "") + '"><b>' + k + ")</b> " + esc(q.secenekler[k]) + '</div>'; }).join("") +
        (x.aciklama ? '<div class="exp">' + esc(x.aciklama) + '</div>' : "") + '</div>';
    });
    h += '<a class="primary" style="display:block;text-align:center;text-decoration:none;padding:14px;border-radius:12px;background:var(--ok);color:#fff;font-weight:600" href="#/p/' + esc(id) + '/giris">Giriş kartımı göster</a><a class="ghost" href="#/p/' + esc(id) + '">Pratik sayfasına dön</a>';
    return { title: "Test sonucu", back: "#/p/" + id, html: h };
  }
  function show(res) {
    $view.innerHTML = res.html; $title.textContent = res.title; $back.hidden = !res.back; $back.dataset.to = res.back || ""; window.scrollTo(0, 0);
    if (res.after) res.after();
  }

  /* ---------- Başlat ---------- */
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) navigator.serviceWorker.register("sw.js").catch(function () {});
  go();
})();
