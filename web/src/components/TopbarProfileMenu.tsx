"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { roleLabel } from "@/lib/labels";

// Retorna SVG de avatar padrão elegante baseado no papel
function getRoleAvatar(role: string): string {
  const norm = role.toLowerCase();
  if (norm.includes("vet")) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
        <rect width="80" height="80" rx="40" fill="#dceefb"/>
        <path d="M16 78c3-16 14-24 24-24s21 8 24 24" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
        <path d="M32 54l8 11 8-11" fill="#0284c7"/>
        <circle cx="40" cy="31" r="13" fill="#f1c29b"/>
        <path d="M25 34c0-13 6-20 15-20s15 7 15 20c-2-6-6-9-15-9s-13 3-15 9z" fill="#4a2e1b"/>
        <path d="M36 37c2.5 1.8 5.5 1.8 8 0" stroke="#9e4747" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      </svg>`
    )}`;
  }
  if (norm.includes("zootec")) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
        <rect width="80" height="80" rx="40" fill="#faecd8"/>
        <path d="M16 78c3-16 14-24 24-24s21 8 24 24" fill="#78350f"/>
        <circle cx="40" cy="31" r="13" fill="#e6b185"/>
        <path d="M27 27c1-8 6-13 13-13s12 5 13 13c-3-2-7-3-13-3s-10 1-13 3z" fill="#1f2937"/>
        <rect x="30" y="27" width="8" height="5" rx="1.5" fill="none" stroke="#1f2937" stroke-width="1.6"/>
        <rect x="42" y="27" width="8" height="5" rx="1.5" fill="none" stroke="#1f2937" stroke-width="1.6"/>
        <line x1="38" y1="29" x2="42" y2="29" stroke="#1f2937" stroke-width="1.6"/>
      </svg>`
    )}`;
  }
  if (norm.includes("oper") || norm.includes("cuid") || norm.includes("func")) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
        <rect width="80" height="80" rx="40" fill="#e2e8f0"/>
        <path d="M16 78c3-16 14-24 24-24s21 8 24 24" fill="#235c2a"/>
        <circle cx="40" cy="32" r="13" fill="#d9a173"/>
        <path d="M26 26c2-7 8-11 14-11s12 4 14 11z" fill="#235c2a"/>
        <path d="M24 26h32" stroke="#1b4920" stroke-width="3" stroke-linecap="round"/>
      </svg>`
    )}`;
  }
  if (norm.includes("gerente")) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
        <rect width="80" height="80" rx="40" fill="#e5dec9"/>
        <path d="M16 78c3-16 14-24 24-24s21 8 24 24" fill="#3a5a30"/>
        <circle cx="40" cy="32" r="13" fill="#dfa878"/>
        <ellipse cx="40" cy="20" rx="19" ry="5" fill="#8c6239"/>
        <path d="M28 20c2-6 22-6 24 0" fill="#a67c52"/>
        <path d="M34 37c3 2 9 2 12 0" stroke="#4a3525" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg>`
    )}`;
  }
  // Padrão Administrador
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
      <defs>
        <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#d7e8d9"/>
          <stop offset="100%" stop-color="#b4d2b8"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" rx="40" fill="url(#bg1)"/>
      <path d="M16 78c3-16 14-24 24-24s21 8 24 24" fill="#1e3a23"/>
      <path d="M31 54l9 12 9-12" fill="#ffffff"/>
      <path d="M38 57l2 9 2-9-2-3z" fill="#235c2a"/>
      <circle cx="40" cy="31" r="13.5" fill="#eab68c"/>
      <path d="M26.5 29c0-9 5.5-15 13.5-15s13.5 6 13.5 15c-2-3-5.5-5-13.5-5s-11.5 2-13.5 5z" fill="#2c221e"/>
      <path d="M33 36c2 2.2 12 2.2 14 0" stroke="#3b2b25" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`
  )}`;
}

export default function TopbarProfileMenu({
  email,
  farmName,
  farmCode,
  userRole = "administrador",
  isAdmin = false,
  alertCount = 0,
}: {
  email: string;
  farmName?: string;
  farmCode?: string;
  userRole?: string;
  isAdmin?: boolean;
  alertCount?: number;
}) {
  const [customPhoto, setCustomPhoto] = useState<string | null>(null);
  const [openProfile, setOpenProfile] = useState(false);
  const [openAlerts, setOpenAlerts] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Deriva o nome de exibição a partir do e-mail ou prefixo
  const displayName = (() => {
    const raw = (email || "").split("@")[0] || "Gestor";
    if (raw.toLowerCase().startsWith("rafael")) return "Rafael Takano";
    return raw.replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  })();

  const currentRoleLabel = roleLabel(userRole);

  useEffect(() => {
    try {
      const savedPhoto = localStorage.getItem("jr_custom_avatar");
      if (savedPhoto) setCustomPhoto(savedPhoto);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenProfile(false);
        setOpenAlerts(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      setCustomPhoto(result);
      try {
        localStorage.setItem("jr_custom_avatar", result);
      } catch {
        // ignore
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResetPhoto = () => {
    setCustomPhoto(null);
    try {
      localStorage.removeItem("jr_custom_avatar");
    } catch {
      // ignore
    }
  };

  const avatarSrc = customPhoto || getRoleAvatar(userRole);

  return (
    <div
      ref={menuRef}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "relative",
      }}
    >
      {/* Sino de Notificações com Contador Verde (Fiel às Imagens 2, 3 e 5) */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            setOpenAlerts((v) => !v);
            setOpenProfile(false);
          }}
          aria-label="Notificações e Alertas"
          title="Alertas Operacionais da Fazenda"
          style={{
            position: "relative",
            width: 40,
            height: 40,
            borderRadius: 10,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            color: "var(--ink)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {alertCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                background: "#10b981",
                color: "#ffffff",
                fontSize: 10.5,
                fontWeight: 700,
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
                border: "2px solid var(--surface)",
              }}
            >
              {alertCount}
            </span>
          )}
        </button>

        {openAlerts && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 340,
              background: "var(--surface)",
              border: "1px solid var(--line-strong)",
              borderRadius: 14,
              boxShadow: "var(--shadow-card-hover)",
              padding: 14,
              zIndex: 100,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingBottom: 10,
                borderBottom: "1px solid var(--line)",
                marginBottom: 10,
              }}
            >
              <strong style={{ fontSize: 13.5, color: "var(--ink)" }}>
                Alertas da Fazenda
              </strong>
              <span className="badge" style={{ fontSize: 11 }}>
                {alertCount > 0 ? `${alertCount} pendente(s)` : "Em dia"}
              </span>
            </div>

            {alertCount === 0 ? (
              <div style={{ padding: "18px 10px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" style={{ margin: "0 auto 8px", display: "block" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Tudo em dia! Nenhuma pendência urgente ou alerta crítico no rebanho.
              </div>
            ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link
                href="/health"
                onClick={() => setOpenAlerts(false)}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 10,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--line)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#c93535",
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                    Vacinação - Brucelose & Aftosa
                  </div>
                  <div style={{ color: "var(--muted)" }}>
                    Lote Fêmeas · Verificar calendário sanitário
                  </div>
                </div>
              </Link>

              <Link
                href="/stock"
                onClick={() => setOpenAlerts(false)}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 10,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--line)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#c97a16",
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                    Estoque de Insumos - Ração / Sal Mineral
                  </div>
                  <div style={{ color: "var(--muted)" }}>
                    Conferir saldo mínimo de reposição
                  </div>
                </div>
              </Link>

              <Link
                href="/weighings"
                onClick={() => setOpenAlerts(false)}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 10px",
                  borderRadius: 10,
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--line)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#10b981",
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                    Rotina de Pesagem Mensal
                  </div>
                  <div style={{ color: "var(--muted)" }}>
                    Curral pronto para importação Coimma / Tru-Test
                  </div>
                </div>
              </Link>
            </div>
            )}
          </div>
        )}
      </div>

      {/* Perfil Fixo do Usuário no Canto Superior Direito (Conforme Requisitos de 03/11/2026) */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => {
            setOpenProfile((v) => !v);
            setOpenAlerts(false);
          }}
          aria-expanded={openProfile}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "5px 12px 5px 6px",
            borderRadius: 999,
            border: "1px solid var(--line)",
            background: "var(--surface)",
            cursor: "pointer",
            boxShadow: "var(--shadow-sm)",
            transition: "all 0.15s ease",
          }}
        >
          <img
            src={avatarSrc}
            alt={displayName}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid var(--brand-border)",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              lineHeight: 1.2,
              textAlign: "left",
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: "var(--ink)",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </span>
            <span
              style={{
                fontSize: 11.5,
                color: "var(--brand)",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {currentRoleLabel}
            </span>
          </div>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="2.2"
            style={{
              marginLeft: 2,
              transform: openProfile ? "rotate(180deg)" : "none",
              transition: "transform 0.15s ease",
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {openProfile && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 320,
              background: "var(--surface)",
              border: "1px solid var(--line-strong)",
              borderRadius: 16,
              boxShadow: "var(--shadow-card-hover)",
              padding: 16,
              zIndex: 110,
            }}
          >
            {/* Cabeçalho do Perfil Autenticado (Fixo e Não Trocável) */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                paddingBottom: 12,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <img
                src={avatarSrc}
                alt={displayName}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: "2px solid var(--brand)",
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14.5,
                    color: "var(--ink)",
                  }}
                >
                  {displayName}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--brand)",
                    fontWeight: 600,
                  }}
                >
                  {currentRoleLabel}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {email}
                </div>
              </div>
            </div>

            {/* Opção para alterar foto do perfil do usuário */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 10,
                paddingBottom: 12,
                borderBottom: "1px solid var(--line)",
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                style={{ display: "none" }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn ghost"
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  fontSize: 12,
                  justifyContent: "center",
                }}
              >
                Alterar Foto
              </button>
              {customPhoto && (
                <button
                  type="button"
                  onClick={handleResetPhoto}
                  className="btn ghost"
                  style={{ padding: "6px 10px", fontSize: 12 }}
                >
                  Padrão
                </button>
              )}
            </div>

            {/* Informações da Unidade / Organização */}
            <div style={{ marginTop: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--muted)",
                  marginBottom: 6,
                }}
              >
                Organização & Unidade
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--ink)",
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                JR Com. e Exp. de Café · Pecuária
              </div>

              {farmName && (
                <Link
                  href="/farms"
                  onClick={() => setOpenProfile(false)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "7px 10px",
                    borderRadius: 8,
                    fontSize: 12,
                    color: "var(--ink-secondary)",
                    background: "var(--bg-subtle)",
                    border: "1px solid var(--line)",
                  }}
                >
                  <span>
                    Unidade: <strong>{farmCode} · {farmName}</strong>
                  </span>
                  <span style={{ color: "var(--brand)", fontWeight: 700 }}>
                    Trocar →
                  </span>
                </Link>
              )}
            </div>

            {/* Links Administrativos e Sair (Botão Equipe & Perfis Visível APENAS para Administrador) */}
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid var(--line)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {isAdmin && (
                  <Link
                    href="/users"
                    onClick={() => setOpenProfile(false)}
                    className="btn ghost"
                    style={{
                      flex: 1,
                      padding: "7px 10px",
                      fontSize: 12.5,
                      justifyContent: "center",
                    }}
                  >
                    Equipe & Perfis
                  </Link>
                )}
                <form action="/auth/signout" method="post" style={{ flex: 1 }}>
                  <button
                    type="submit"
                    className="btn ghost"
                    style={{
                      width: "100%",
                      padding: "7px 10px",
                      fontSize: 12.5,
                      color: "var(--red)",
                      borderColor: "var(--red-border)",
                      justifyContent: "center",
                    }}
                  >
                    Sair da Conta
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
