<script lang="ts">
	import type { MetaDTO } from '$lib/types';
	import { density, theme } from '$lib/stores';

	interface Props { meta: MetaDTO | null; }
	let { meta }: Props = $props();

	function toggleTheme() {
		theme.update(t => {
			const next = t === 'dark' ? 'light' : 'dark';
			document.documentElement.setAttribute('data-theme', next);
			return next;
		});
	}
	function toggleDensity() {
		density.update(d => {
			const next = d === 'comfortable' ? 'compact' : 'comfortable';
			document.documentElement.setAttribute('data-density', next);
			return next;
		});
	}
</script>

<div class="topbar">
	<div class="brand">
		<span class="dot">▸</span>
		<!-- Maple leaf SVG -->
		<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style="opacity:.9">
			<path fill="#a6192e" d="M12 2l1.2 4.2 4-2.4-1 4.4 4.4-.6-3.2 3.2 3.6 1.8-4.2 1.4 1.6 3.8-4.2-.8.2 4.2-2.4-3.4-2.4 3.4.2-4.2-4.2.8 1.6-3.8L2 12.6l3.6-1.8L2.4 7.6 6.8 8.2l-1-4.4 4 2.4z"/>
		</svg>
		<span class="name">GWEN-OPS-CA 🍁</span>
		{#if meta}
			<span class="chip mono" style="border-radius:4px;font-size:10px;padding:1px 6px;">v{meta.version}</span>
		{/if}
	</div>

	{#if meta}
		<div class="stats">
			<span><b>{meta.totalOffers}</b> postings</span>
			<span>Generated <b>{meta.generated}</b></span>
		</div>
	{/if}

	<div class="right">
		<button class="icon-btn" onclick={toggleTheme} title="Toggle theme">
			{$theme === 'dark' ? '◑' : '○'}
		</button>
		<button class="icon-btn" onclick={toggleDensity} title="Toggle density">
			{$density === 'comfortable' ? '⊟' : '⊞'}
		</button>
	</div>
</div>
