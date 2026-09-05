/**
 * SDK code generator — produces a ready-to-run request in six languages for
 * any endpoint in the catalog. Shared by the API page, Docs and Playground.
 */

import { BASE_URL, buildExampleRequest } from './endpointCatalog.js';

const escape = (str) => str.replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

export const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
  { id: 'java', label: 'Java' },
  { id: 'php', label: 'PHP' },
  { id: 'curl', label: 'cURL' }
];

const bodyLiteral = (endpoint, base) => {
  const m = buildExampleRequest(endpoint, { base });
  const nl = m.indexOf('\n\n');
  return nl >= 0 ? m.slice(nl + 2) : '{}';
};

export const generateCode = (endpoint, { base = BASE_URL, apiKey = '<api_key>', params } = {}) => {
  const method = endpoint.method.toLowerCase();
  const paramDefs = endpoint.params || [];
  const hasBody = method !== 'get';

  // Identify path parameter names from the endpoint path pattern.
  const pathParamNames = new Set();
  for (const m of endpoint.path.matchAll(/\{(\w+)\}/g)) {
    pathParamNames.add(m[1]);
  }

  // Live params (Playground): drop blank fields, exclude path params from
  // body/query, and cast types so the generated code matches the executed request.
  const live = params
    ? Object.fromEntries(
        Object.entries(params)
          .filter(([k, v]) => v !== '' && v !== null && v !== undefined && !pathParamNames.has(k))
          .map(([k, v]) => {
            const def = paramDefs.find((p) => p.name === k);
            if (def && def.type === 'number') {
              const n = Number(v);
              if (Number.isFinite(n)) return [k, n];
            }
            if (def && (def.type === 'object' || def.type === 'array')) {
              try { return [k, JSON.parse(v)]; } catch { /* keep as string */ }
            }
            return [k, v];
          })
      )
    : null;

  const query =
    live && !hasBody && Object.keys(live).length ? `?${new URLSearchParams(live).toString()}` : '';

  let fullUrl = `${base}${endpoint.path}${query}`;
  // Replace path placeholders using the raw params.
  if (params) {
    Object.keys(params).forEach((k) => {
      if (pathParamNames.has(k) && params[k] !== '' && params[k] != null) {
        fullUrl = fullUrl.replace(`{${k}}`, encodeURIComponent(String(params[k])));
      }
    });
  }

  // Prefer the caller's live parameter values so the snippet matches what is
  // actually being tested. Falls back to the endpoint's example request.
  const body = live
    ? JSON.stringify(live, null, 2) || '{}'
    : bodyLiteral(endpoint, base);
  const auth = endpoint.keyType !== null && endpoint.keyType !== undefined && apiKey;

  // Java-safe string literal of the JSON body (text blocks cannot be used here
  // reliably — their closing delimiter must sit on its own line, which breaks
  // when the body is multi-line).
  const javaBody = `"${body
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')}"`;
  // PHP POSTFIELDS accepts a raw JSON string, so pass the body through as-is.
  const phpBody = body.replace(/'/g, "'\\''");

  return {
    javascript: `const res = await fetch('${fullUrl}', {\n  method: '${method.toUpperCase()}',${auth ? `\n  headers: {\n    'Authorization': 'Bearer ${apiKey}',\n    'Content-Type': 'application/json'\n  },` : `\n  headers: { 'Content-Type': 'application/json' },`}${hasBody ? `\n  body: JSON.stringify(${escape(body).replace(/\n/g, '\n  ')})` : ''}\n});\n\nconst data = await res.json();\nconsole.log(data);`,

    python: `import requests\n\nheaders = ${auth ? `{"Authorization": "Bearer ${apiKey}", "Content-Type": "application/json"}` : '{"Content-Type": "application/json"}'}\n\n${hasBody ? `payload = ${JSON.stringify(JSON.parse(body), null, 4)}\n\n` : ''}resp = requests.${method}("${fullUrl}"${hasBody ? ', json=payload' : ''}, headers=headers)\nprint(resp.status_code)\nprint(resp.json())`,

    go: `package main\n\nimport (\n    "bytes"\n    "encoding/json"\n    "fmt"\n    "io"\n    "net/http"\n)\n\nfunc main() {\n    ${hasBody ? `payload := []byte(\`${body}\`)\n    req, err := http.NewRequest("${method.toUpperCase()}", "${fullUrl}", bytes.NewBuffer(payload))` : `req, err := http.NewRequest("${method.toUpperCase()}", "${fullUrl}", nil)`}\n    if err != nil { panic(err) }\n${auth ? `    req.Header.Set("Authorization", "Bearer ${apiKey}")\n` : ''}    req.Header.Set("Content-Type", "application/json")\n\n    client := &http.Client{}\n    resp, err := client.Do(req)\n    if err != nil { panic(err) }\n    defer resp.Body.Close()\n\n    body, _ := io.ReadAll(resp.Body)\n    fmt.Println(resp.StatusCode)\n    fmt.Println(string(body))\n}`,

    java: `import java.net.http.HttpClient;\nimport java.net.http.HttpRequest;\nimport java.net.http.HttpResponse;\nimport java.net.URI;\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        String body = ${javaBody};\n\n        var request = HttpRequest.newBuilder()\n            .uri(URI.create("${fullUrl}"))\n            .${hasBody ? `POST(HttpRequest.BodyPublishers.ofString(body))` : `GET()`}\n${auth ? `            .header("Authorization", "Bearer ${apiKey}")\n` : ''}            .header("Content-Type", "application/json")\n            .build();\n\n        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());\n        System.out.println(response.statusCode());\n        System.out.println(response.body());\n    }\n}`,

    php: `<?php\n\n$url = '${fullUrl}';\n${auth ? `$headers = [\n    'Authorization: Bearer ${apiKey}',\n    'Content-Type: application/json',\n];\n` : `$headers = ['Content-Type: application/json'];\n`}${hasBody ? `$body = '${phpBody}';\n\n$ch = curl_init($url);\ncurl_setopt($ch, CURLOPT_CUSTOMREQUEST, '${method.toUpperCase()}');\ncurl_setopt($ch, CURLOPT_POSTFIELDS, $body);\ncurl_setopt($ch, CURLOPT_HTTPHEADER, $headers);\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\n\n$response = curl_exec($ch);\n$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);\ncurl_close($ch);\n\necho $status . "\\n";\necho $response;` : `$ch = curl_init($url);\ncurl_setopt($ch, CURLOPT_HTTPHEADER, $headers);\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\n\n$response = curl_exec($ch);\n$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);\ncurl_close($ch);\n\necho $status . "\\n";\necho $response;`}`,

    curl: `curl -X ${method.toUpperCase()} "${fullUrl}" \\\n  -H "Content-Type: application/json"${auth ? ` \\\n  -H "Authorization: Bearer ${apiKey}"` : ''}${hasBody ? ` \\\n  -d '${body.replace(/'/g, "'\\''")}'` : ''}`
  };
};
