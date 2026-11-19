import { useEffect, useState } from 'react';

interface AvatarProps {
  src?: string | null;
  accountId?: string;
  name: string;
  size?: number;
  shape?: 'circle' | 'rounded';
  className?: string;
}

const dataUrlCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

const PALETTE = [
  '#e05a2b',
  '#d97706',
  '#059669',
  '#0284c7',
  '#4f46e5',
  '#9333ea',
  '#db2777',
  '#0d9488'
];

function hashColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function getInitials(name: string): string {
  const cleaned = name.replace(/^@/, '').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/[\s/_-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

async function loadAvatarDataUrl(url: string, accountId?: string): Promise<string | null> {
  const key = `${accountId ?? 'anon'}:${url}`;
  if (dataUrlCache.has(key)) {
    return dataUrlCache.get(key) ?? null;
  }
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = window.gitlabDesktop
    .invoke('gitlab:fetchAvatar', { url, accountId })
    .then((res) => {
      const value = res.ok ? res.data.dataUrl : null;
      dataUrlCache.set(key, value);
      return value;
    })
    .catch(() => {
      dataUrlCache.set(key, null);
      return null;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export function Avatar({
  src,
  accountId,
  name,
  size = 24,
  shape = 'circle',
  className
}: AvatarProps): React.JSX.Element {
  const key = src ? `${accountId ?? 'anon'}:${src}` : null;
  const [dataUrl, setDataUrl] = useState<string | null>(() => {
    if (!src) return null;
    if (src.startsWith('data:')) return src;
    return key ? (dataUrlCache.get(key) ?? null) : null;
  });

  useEffect(() => {
    if (!src) {
      setDataUrl(null);
      return;
    }
    if (src.startsWith('data:')) {
      setDataUrl(src);
      return;
    }
    const cacheKey = `${accountId ?? 'anon'}:${src}`;
    if (dataUrlCache.has(cacheKey)) {
      setDataUrl(dataUrlCache.get(cacheKey) ?? null);
      return;
    }
    let cancelled = false;
    void loadAvatarDataUrl(src, accountId).then((resolved) => {
      if (!cancelled) setDataUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [src, accountId]);

  const radius = shape === 'circle' ? '999px' : `${Math.max(5, Math.round(size * 0.24))}px`;
  const fontSize = Math.max(9, Math.round(size * 0.4));

  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt={name}
        className={`vulpes-avatar${className ? ` ${className}` : ''}`}
        style={{
          width: size,
          height: size,
          borderRadius: radius
        }}
        draggable={false}
      />
    );
  }

  return (
    <span
      className={`vulpes-avatar-fallback${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize,
        background: hashColor(name)
      }}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}
