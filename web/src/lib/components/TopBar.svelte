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
		<span class="name">GWEN-OPS-CA</span>
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
