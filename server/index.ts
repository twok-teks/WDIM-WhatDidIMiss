import { loadCatalog } from './catalog';
import { GroqEvidenceModel } from './groq-model';
import { GroundedService } from './grounded-service';
import { createGateway } from './http';
import { WikidataBackground } from './background-lookup';
import { loadRelated } from './related-context';

try {
  const origins = (process.env.WDIM_EXTENSION_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const catalog = await loadCatalog(process.env.WDIM_KNOWLEDGE_FILE);
  const service = new GroundedService(
    catalog,
    new GroqEvidenceModel(process.env.GROQ_API_KEY ?? ''),
    new WikidataBackground(),
    await loadRelated(process.env.WDIM_RELATED_CONTEXT_FILE),
  );
  const server = createGateway(service, origins);
  server.on('error', () => {
    console.error('WDIM gateway could not listen on 127.0.0.1:8787.');
    process.exitCode = 1;
  });
  server.listen(8787, '127.0.0.1', () => {
    console.log(
      `WDIM gateway listening on http://127.0.0.1:8787; ${catalog.length} curated assets loaded. No request logging.`,
    );
    if (!catalog.length)
      console.log(
        'Caption questions are available. No verified story catalog configured; full-story retrieval remains unavailable.',
      );
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () => {
      server.closeAllConnections();
      server.close(() => process.exit(0));
    });
} catch {
  console.error(
    'WDIM gateway setup failed. Check server/.env: GROQ_API_KEY, WDIM_EXTENSION_ORIGINS, and the optional verified catalog file.',
  );
  process.exitCode = 1;
}
