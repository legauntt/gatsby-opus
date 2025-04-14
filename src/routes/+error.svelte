<script>
	import { page } from '$app/state';
</script>

<div class="p-5">
	<h1 class="text-3xl text-red-500">{page.status} {page.error?.message}</h1>

	<div class="mt-5">
		<img src="/lar/20.png" alt="Pitchaw on da 20" class="h-96" />

		<div class="mt-5">
			<a href="/" class="text-3xl text-blue-300">Abzolutely</a>
		</div>
	</div>
</div>
