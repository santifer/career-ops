<script lang="ts">
	import { onMount } from 'svelte';
	import TopBar from '$lib/components/TopBar.svelte';
	import StateBar from '$lib/components/StateBar.svelte';
	import StatsBanner from '$lib/components/StatsBanner.svelte';
	import PipelineList from '$lib/components/PipelineList.svelte';
	import PipelineListCompact from '$lib/components/PipelineListCompact.svelte';
	import ReportPanel from '$lib/components/ReportPanel.svelte';
	import FileEditor from '$lib/components/FileEditor.svelte';
	import Keybinds from '$lib/components/Keybinds.svelte';

	import { fetchOffers, fetchFiles } from '$lib/api';
	import { offers, meta, states, files, activeId, pipeSize, evalSize, view } from '$lib/stores';

	let loading = $state(true);
	let error   = $state<string | null>(null);

	onMount(async () => {
		try {
			const [offersRes, filesRes] = await Promise.all([
				fetchOffers(),
				fetchFiles().catch(() => [])
			]);
			meta.set(offersRes.meta);
			states.set(offersRes.states);
			offers.set(offersRes.offers);
			files.set(filesRes);
			if (offersRes.offers.length > 0 && !window.location.hash) {
				activeId.set(offersRes.offers[0].n);
			}
			const m = window.location.hash.match(/^#posting\/(\d+)$/);
			if (m) activeId.set(parseInt(m[1], 10));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load data';
		} finally {
			loading = false;
		}
	});

	$effect(() => {
		const id = $activeId;
		if (id != null) history.replaceState(null, '', `#posting/${id}`);
	});

	const activeOffer = $derived(() => $offers.find(o => o.n === $activeId) ?? null);

	function togglePipeExpand() {
		pipeSize.update(s => {
			const next = s === 'expanded' ? 'normal' : 'expanded';
			if (next === 'expanded') evalSize.set('normal');
			return next;
		});
	}
	function pipeMini() { pipeSize.set('min'); evalSize.set('normal'); }
</script>

<div class="app">
	<!-- Canadiana accent strip -->
	<div class="canada-strip"></div>

	<TopBar meta={$meta} />
	<StatsBanner offers={$offers} meta={$meta} />
	<StateBar states={$states} />

	<!-- Main split -->
	<div class="main-split" data-pipe={$pipeSize} data-eval={$evalSize}>

		<!-- Pipeline panel -->
		<div class="panel panel-pipe">
			<!-- Minimised strip -->
			<button class="panel-strip" onclick={() => pipeSize.set('normal')} title="Restore pipeline">
				<span class="ico">▶</span>
				<span class="v-label">Pipeline · {$offers.length}</span>
			</button>

			<div class="panel-header">
				<span class="title">Pipeline</span>
				<span style="color:var(--fg-3);font-size:11px">· {$offers.length} postings · grouped</span>
				<div class="right">
					<button class="icon-btn" onclick={togglePipeExpand} title={$pipeSize === 'expanded' ? 'Restore (50/50)' : 'Expand to 2/3'}>
						{$pipeSize === 'expanded' ? '⤡' : '⤢'}
					</button>
					<button class="icon-btn" onclick={pipeMini} title="Minimise pipeline">◀</button>
				</div>
			</div>

			<PipelineList offers={$offers} />
		</div>

		<!-- Evaluation panel -->
		<div class="panel panel-eval" style="display:flex;flex-direction:column;min-width:0">
			{#if loading}
				<div style="display:flex;align-items:center;justify-content:center;flex:1;color:var(--fg-3);font-family:var(--mono);font-size:12px">
					Loading pipeline…
				</div>
			{:else if error}
				<div style="display:flex;align-items:center;justify-content:center;flex:1;flex-direction:column;gap:12px;color:var(--red-2);font-family:var(--mono);font-size:13px">
					<div>⚠ {error}</div>
					<div style="color:var(--fg-3);font-size:11px">Make sure the Go server is running: cd dashboard && go run ./cmd/server -path ..</div>
				</div>
			{:else if $view === 'report'}
				<ReportPanel offer={activeOffer()} />
			{:else}
				<FileEditor files={$files} />
			{/if}
		</div>
	</div>

	<Keybinds />
</div>
