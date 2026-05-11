<script lang="ts">
	import '../app.css';
	import {
		pipeSize,
		activeId, offers, openPath, dirty, fileContent
	} from '$lib/stores';
	import { saveFile } from '$lib/api';
	import { get } from 'svelte/store';

	let { children } = $props();

	function isInputFocused(): boolean {
		const el = document.activeElement;
		return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
	}

	function onKeydown(e: KeyboardEvent) {
		const meta = e.metaKey || e.ctrlKey;

		if (meta && e.key === '\\') {
			e.preventDefault();
			pipeSize.update(s => s === 'normal' ? 'expanded' : s === 'expanded' ? 'min' : 'normal');
			return;
		}
		if (meta && e.key.toLowerCase() === 's') {
			e.preventDefault();
			const path = get(openPath);
			if (get(dirty)[path]) {
				const content = get(fileContent)[path] ?? '';
				saveFile(path, content).then(() => {
					dirty.update(d => ({ ...d, [path]: false }));
				});
			}
			return;
		}

		if (isInputFocused()) return;

		if (e.key === 'j' || e.key === 'k') {
			e.preventDefault();
			const list = get(offers);
			const cur = get(activeId);
			const idx = list.findIndex(o => o.n === cur);
			if (e.key === 'j' && idx < list.length - 1) activeId.set(list[idx + 1].n);
			if (e.key === 'k' && idx > 0) activeId.set(list[idx - 1].n);
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{@render children()}
