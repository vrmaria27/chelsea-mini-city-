"""Packs the CC0 Poly Haven maps (references/textures, fetched by fetch-polyhaven.mjs) into the two small
texture-array strips the renderer loads (public/tex):
  detail.jpg  — per layer, the albedo divided by its mean colour (×0.5): a colour-neutral *detail* map that
                multiplies the model's own colour, so a building keeps its surveyed colour and gains brick,
                mortar, grain and wear variation;
  surface.jpg — per layer, the OpenGL normal map (RG) and roughness (B).
Layers (in order) must match MAT_LAYERS in src/engine/materials.ts. Usage: python3 scripts/assets/pack-textures.py
"""
import json
from PIL import Image, ImageFilter
SRC = 'references/textures'
LAYERS = ['brick', 'stone', 'paving', 'asphalt', 'bark']
N = 512
det = Image.new('RGB', (N, N * len(LAYERS)))
sur = Image.new('RGB', (N, N * len(LAYERS)))
for k, name in enumerate(LAYERS):
    d = Image.open(f'{SRC}/{name}_diff.jpg').convert('RGB').resize((N, N), Image.LANCZOS)
    px = d.load()
    # mean per channel (in linear light), then ratio → 0.5 × ratio, clamped to [0, 1]
    lin = lambda v: (v / 255) ** 2.2
    tot = [0.0, 0.0, 0.0]
    for y in range(N):
        for x in range(N):
            c = px[x, y]
            for i in range(3): tot[i] += lin(c[i])
    mean = [t / (N * N) for t in tot]
    out = Image.new('RGB', (N, N)); po = out.load()
    for y in range(N):
        for x in range(N):
            c = px[x, y]
            po[x, y] = tuple(max(0, min(255, round(min(2.0, lin(c[i]) / mean[i]) * 0.5 * 255))) for i in range(3))
    det.paste(out, (0, k * N))
    n = Image.open(f'{SRC}/{name}_nor.jpg').convert('RGB').resize((N, N), Image.LANCZOS)
    r = Image.open(f'{SRC}/{name}_rough.jpg').convert('L').resize((N, N), Image.LANCZOS)
    nr, ng, _ = n.split()
    sur.paste(Image.merge('RGB', (nr, ng, r)), (0, k * N))
    print(name, 'mean', [round(m, 3) for m in mean])
det.save('public/tex/detail.jpg', quality=86)
sur.save('public/tex/surface.jpg', quality=88)
idx = json.load(open(f'{SRC}/index.json'))
json.dump({'layers': LAYERS, 'size': N, 'sources': {l: idx[l] for l in LAYERS}}, open('public/tex/sources.json', 'w'), indent=1)
