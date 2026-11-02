import { declareIndexPlugin, ReactRNPlugin, RNPlugin, SelectionType } from '@remnote/plugin-sdk';

// Devolve os IDs das referências de um bloco, mas só se o bloco tiver APENAS
// referências (espaços em branco são ignorados). Se tiver texto, imagem etc., devolve null.
function getReferencedIds(text: any): string[] | null {
  if (!text || text.length === 0) return null;
  const ids: string[] = [];
  for (const el of text) {
    if (typeof el === 'string') {
      if (el.trim() !== '') return null;
    } else if (el && el.i === 'q' && el._id) {
      ids.push(el._id);
    } else if (el && el.i === 'm' && typeof el.text === 'string' && el.text.trim() === '') {
      continue;
    } else {
      return null;
    }
  }
  return ids.length > 0 ? ids : null;
}

async function convertSelectedToPortals(plugin: RNPlugin) {
  const sel: any = await plugin.editor.getSelection();
  if (!sel || sel.type !== SelectionType.Rem || !sel.remIds || sel.remIds.length === 0) {
    await plugin.app.toast('Selecione um ou mais blocos inteiros (não só texto) e rode o comando de novo.');
    return;
  }

  let converted = 0;
  let skippedText = 0;
  let skippedChildren = 0;
  let failed = 0;

  for (const remId of sel.remIds as string[]) {
    try {
      const rem = await plugin.rem.findOne(remId);
      if (!rem || !rem.parent) { failed++; continue; }

      const refIds = getReferencedIds(rem.text);
      if (!refIds) { skippedText++; continue; }
      if (rem.children && rem.children.length > 0) { skippedChildren++; continue; }

      const targets = await plugin.rem.findMany(refIds);
      if (!targets || targets.length === 0) { failed++; continue; }

      const portal = await plugin.rem.createPortal();
      if (!portal) { failed++; continue; }
      for (const target of targets) {
        await target.addToPortal(portal);
      }

      // Coloca o portal na posição do bloco original e depois apaga o original.
      const parent = await plugin.rem.findOne(rem.parent);
      const siblings = (parent && parent.children) || [];
      const index = Math.max(0, siblings.indexOf(rem._id));
      await plugin.rem.moveRems([portal], rem.parent, index);
      await rem.remove();

      converted++;
    } catch (e) {
      console.error('Erro ao converter bloco', remId, e);
      failed++;
    }
  }

  let msg = `${converted} referência(s) convertida(s) em portal.`;
  if (skippedText > 0) msg += ` ${skippedText} bloco(s) pulado(s) por terem texto além da referência.`;
  if (skippedChildren > 0) msg += ` ${skippedChildren} pulado(s) por terem blocos filhos.`;
  if (failed > 0) msg += ` ${failed} com erro (veja o console).`;
  await plugin.app.toast(msg);
}

async function onActivate(plugin: ReactRNPlugin) {
  // Campo nas configurações do plugin para o usuário escolher o atalho.
  await plugin.settings.registerStringSetting({
    id: 'shortcut',
    title: 'Keyboard shortcut / Atalho de teclado',
    description:
      'Default: ctrl+shift+q. Examples: opt+shift+p. Type none for no shortcut. Reload RemNote after changing. / Recarregue o RemNote depois de mudar.',
    defaultValue: 'ctrl+shift+q',
  });
  const saved = ((await plugin.settings.getSetting('shortcut')) as string) || 'ctrl+shift+q';
  const shortcut = saved.trim().toLowerCase();

  await plugin.app.registerCommand({
    id: 'convert-references-to-portals',
    name: 'Converter referências selecionadas em portais',
    description: 'Transforma cada bloco selecionado que contém só uma referência em um portal.',
    keywords: 'portal portais referencia referência converter convert references',
    keyboardShortcut: shortcut === 'none' || shortcut === '' ? undefined : shortcut,
    action: async () => {
      await convertSelectedToPortals(plugin);
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);