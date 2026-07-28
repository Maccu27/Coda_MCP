import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import z from "zod";
import packageJson from "../package.json";
import { getPageContent } from "./client/helpers";
import { 
  createPage, 
  listDocs, 
  listPages, 
  updatePage,
  listTables,
  getTable,
  listColumns,
  listRows,
  upsertRows,
  deleteRows,
  getRow,
  updateRow,
  deleteRow,
  getColumn,
  listFormulas,
  getFormula,
  listControls,
  getControl,
  pushButton,
  whoami,
  getDoc,
  updateDoc,
  createDoc,
  deletePage
} from "./client/sdk.gen";

export const server = new McpServer({
  name: "coda-enhanced",
  version: packageJson.version,
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Reduziert die list_rows-Antwort auf das Nötige: pro Zeile id, name, values.
// Verworfen wird der Envelope-Ballast (type, href, index, createdAt, updatedAt,
// browserLink), der pro Zeile Tokens kostet und selten gebraucht wird. Der
// Zugriffspfad data.items[i].values[col] bleibt unveraendert, ebenso die
// Paginierung ueber nextPageToken. Fuer das volle Objekt: fields="voll".
function slimRows(data: any): any {
  if (!data || !Array.isArray(data.items)) return data;
  return {
    items: data.items.map((r: any) => ({ id: r.id, name: r.name, values: r.values })),
    ...(data.nextPageToken ? { nextPageToken: data.nextPageToken } : {}),
  };
}

// ============================================================================
// DOCUMENT OPERATIONS
// ============================================================================

server.tool(
  "coda_list_documents",
  "List or search available documents",
  {
    query: z.string().optional().describe("The query to search for documents by - optional"),
    limit: z.number().int().positive().optional().describe("Maximum number of results to return"),
    isOwner: z.boolean().optional().describe("Show only docs owned by the user"),
    isPublished: z.boolean().optional().describe("Show only published docs"),
  },
  async ({ query, limit, isOwner, isPublished }): Promise<CallToolResult> => {
    try {
      const resp = await listDocs({ 
        query: { query, limit, isOwner, isPublished }, 
        throwOnError: true 
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to list documents : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_get_document",
  "Get detailed information about a specific document",
  {
    docId: z.string().describe("The ID of the document to get information about"),
  },
  async ({ docId }): Promise<CallToolResult> => {
    try {
      const resp = await getDoc({ path: { docId }, throwOnError: true });
      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get document : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_create_document",
  "Create a new document",
  {
    title: z.string().describe("Title of the new document"),
    sourceDoc: z.string().optional().describe("Optional doc ID to copy from"),
    folderId: z.string().optional().describe("Optional folder ID to create the doc in"),
  },
  async ({ title, sourceDoc, folderId }): Promise<CallToolResult> => {
    try {
      const resp = await createDoc({
        body: { title, sourceDoc, folderId },
        throwOnError: true
      });
      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to create document : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_update_document",
  "Update document properties like title",
  {
    docId: z.string().describe("The ID of the document to update"),
    title: z.string().optional().describe("New title for the document"),
    iconName: z.string().optional().describe("New icon name for the document"),
  },
  async ({ docId, title, iconName }): Promise<CallToolResult> => {
    try {
      const resp = await updateDoc({
        path: { docId },
        body: { title, iconName },
        throwOnError: true
      });
      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to update document : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// PAGE OPERATIONS (Enhanced)
// ============================================================================

server.tool(
  "coda_list_pages",
  "List pages in the current document with pagination",
  {
    docId: z.string().describe("The ID of the document to list pages from"),
    limit: z.number().int().positive().optional().describe("The number of pages to return - optional, defaults to 25"),
    nextPageToken: z
      .string()
      .optional()
      .describe(
        "The token need to get the next page of results, returned from a previous call to this tool - optional",
      ),
  },
  async ({ docId, limit, nextPageToken }): Promise<CallToolResult> => {
    try {
      const listLimit = nextPageToken ? undefined : limit;

      const resp = await listPages({
        path: { docId },
        query: { limit: listLimit, pageToken: nextPageToken ?? undefined },
        throwOnError: true,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to list pages : ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "coda_create_page",
  "Create a page in the current document",
  {
    docId: z.string().describe("The ID of the document to create the page in"),
    name: z.string().describe("The name of the page to create"),
    content: z.string().optional().describe("The markdown content of the page to create - optional"),
    parentPageId: z.string().optional().describe("The ID of the parent page to create this page under - optional"),
    subtitle: z.string().optional().describe("Optional subtitle for the page"),
    iconName: z.string().optional().describe("Optional icon name for the page"),
  },
  async ({ docId, name, content, parentPageId, subtitle, iconName }): Promise<CallToolResult> => {
    try {
      const resp = await createPage({
        path: { docId },
        body: {
          name,
          subtitle,
          iconName,
          parentPageId: parentPageId ?? undefined,
          pageContent: {
            type: "canvas",
            canvasContent: { format: "markdown", content: content ?? " " },
          },
        },
        throwOnError: true,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }],
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to create page : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_delete_page",
  "Delete a page from the document",
  {
    docId: z.string().describe("The ID of the document containing the page"),
    pageIdOrName: z.string().describe("The ID or name of the page to delete"),
  },
  async ({ docId, pageIdOrName }): Promise<CallToolResult> => {
    try {
      const resp = await deletePage({
        path: { docId, pageIdOrName },
        throwOnError: true,
      });
      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to delete page : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_get_page_content",
  "Get the content of a page as markdown",
  {
    docId: z.string().describe("The ID of the document that contains the page to get the content of"),
    pageIdOrName: z.string().describe("The ID or name of the page to get the content of"),
  },
  async ({ docId, pageIdOrName }): Promise<CallToolResult> => {
    try {
      const content = await getPageContent(docId, pageIdOrName);

      if (content === undefined) {
        throw new Error("Unknown error has occurred");
      }

      return { content: [{ type: "text", text: content }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get page content : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_peek_page",
  "Peek into the beginning of a page and return a limited number of lines",
  {
    docId: z.string().describe("The ID of the document that contains the page to peek into"),
    pageIdOrName: z.string().describe("The ID or name of the page to peek into"),
    numLines: z
      .number()
      .int()
      .positive()
      .describe("The number of lines to return from the start of the page - usually 30 lines is enough"),
  },
  async ({ docId, pageIdOrName, numLines }): Promise<CallToolResult> => {
    try {
      const content = await getPageContent(docId, pageIdOrName);

      if (!content) {
        throw new Error("Unknown error has occurred");
      }

      const preview = content.split(/\r?\n/).slice(0, numLines).join("\n");

      return { content: [{ type: "text", text: preview }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed to peek page : ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  "coda_replace_page_content",
  "Replace the content of a page with new markdown content",
  {
    docId: z.string().describe("The ID of the document that contains the page to replace the content of"),
    pageIdOrName: z.string().describe("The ID or name of the page to replace the content of"),
    content: z.string().describe("The markdown content to replace the page with"),
  },
  async ({ docId, pageIdOrName, content }): Promise<CallToolResult> => {
    try {
      const resp = await updatePage({
        path: {
          docId,
          pageIdOrName,
        },
        body: {
          // @ts-expect-error auto-generated client types
          contentUpdate: {
            insertionMode: "replace",
            canvasContent: { format: "markdown", content },
          },
        },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to replace page content : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_append_page_content",
  "Append new markdown content to the end of a page",
  {
    docId: z.string().describe("The ID of the document that contains the page to append the content to"),
    pageIdOrName: z.string().describe("The ID or name of the page to append the content to"),
    content: z.string().describe("The markdown content to append to the page"),
  },
  async ({ docId, pageIdOrName, content }): Promise<CallToolResult> => {
    try {
      const resp = await updatePage({
        path: {
          docId,
          pageIdOrName,
        },
        body: {
          // @ts-expect-error auto-generated client types
          contentUpdate: {
            insertionMode: "append",
            canvasContent: { format: "markdown", content },
          },
        },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to append page content : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_duplicate_page",
  "Duplicate a page in the current document",
  {
    docId: z.string().describe("The ID of the document that contains the page to duplicate"),
    pageIdOrName: z.string().describe("The ID or name of the page to duplicate"),
    newName: z.string().describe("The name of the new page"),
  },
  async ({ docId, pageIdOrName, newName }): Promise<CallToolResult> => {
    try {
      const pageContent = await getPageContent(docId, pageIdOrName);
      const createResp = await createPage({
        path: { docId },
        body: {
          name: newName,
          pageContent: { type: "canvas", canvasContent: { format: "markdown", content: pageContent } },
        },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(createResp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to duplicate page : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_rename_page",
  "Rename a page in the current document",
  {
    docId: z.string().describe("The ID of the document that contains the page to rename"),
    pageIdOrName: z.string().describe("The ID or name of the page to rename"),
    newName: z.string().describe("The new name of the page"),
    subtitle: z.string().optional().describe("Optional new subtitle for the page"),
  },
  async ({ docId, pageIdOrName, newName, subtitle }): Promise<CallToolResult> => {
    try {
      const resp = await updatePage({
        path: { docId, pageIdOrName },
        body: {
          name: newName,
          subtitle,
        },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to rename page : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// TABLE OPERATIONS
// ============================================================================

server.tool(
  "coda_list_tables",
  "List all tables and views in a document",
  {
    docId: z.string().describe("The ID of the document to list tables from"),
    tableTypes: z.array(z.enum(["table", "view"])).optional().describe("Filter by table types"),
    limit: z.number().int().positive().optional().describe("Maximum number of results to return"),
  },
  async ({ docId, tableTypes, limit }): Promise<CallToolResult> => {
    try {
      const resp = await listTables({
        path: { docId },
        query: { tableTypes, limit },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to list tables : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_get_table",
  "Get detailed information about a specific table or view",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table to get information about"),
  },
  async ({ docId, tableIdOrName }): Promise<CallToolResult> => {
    try {
      const resp = await getTable({
        path: { docId, tableIdOrName },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get table : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_get_table_summary",
  "Get a detailed summary of a table including row count and column info",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table to summarize"),
  },
  async ({ docId, tableIdOrName }): Promise<CallToolResult> => {
    try {
      // Get table info
      const tableResp = await getTable({ path: { docId, tableIdOrName }, throwOnError: true });
      
      // Get columns
      const columnsResp = await listColumns({ path: { docId, tableIdOrName }, throwOnError: true });
      
      // Get a sample of rows to understand data types
      const rowsResp = await listRows({ 
        path: { docId, tableIdOrName }, 
        query: { limit: 5 },
        throwOnError: true 
      });

      const summary = {
        table: {
          id: tableResp.data.id,
          name: tableResp.data.name,
          type: tableResp.data.tableType,
          rowCount: tableResp.data.rowCount,
          createdAt: tableResp.data.createdAt,
          updatedAt: tableResp.data.updatedAt,
        },
        columns: columnsResp.data.items.map(col => ({
          name: col.name,
          id: col.id,
          type: col.format.type,
          calculated: col.calculated || false,
          display: col.display || false,
        })),
        sampleData: rowsResp.data.items.slice(0, 3), // First 3 rows as sample
        stats: {
          totalColumns: columnsResp.data.items.length,
          calculatedColumns: columnsResp.data.items.filter(c => c.calculated).length,
          displayColumn: columnsResp.data.items.find(c => c.display)?.name || 'Unknown',
        }
      };

      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get table summary : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// COLUMN OPERATIONS
// ============================================================================

server.tool(
  "coda_list_columns",
  "List all columns in a table",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table to list columns from"),
    limit: z.number().int().positive().optional().describe("Maximum number of results to return"),
    visibleOnly: z.boolean().optional().describe("If true, returns only visible columns"),
  },
  async ({ docId, tableIdOrName, limit, visibleOnly }): Promise<CallToolResult> => {
    try {
      const resp = await listColumns({
        path: { docId, tableIdOrName },
        query: { limit, visibleOnly },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to list columns : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_get_column",
  "Get detailed information about a specific column",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table containing the column"),
    columnIdOrName: z.string().describe("The ID or name of the column to get information about"),
  },
  async ({ docId, tableIdOrName, columnIdOrName }): Promise<CallToolResult> => {
    try {
      const resp = await getColumn({
        path: { docId, tableIdOrName, columnIdOrName },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get column : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// ROW OPERATIONS
// ============================================================================

server.tool(
  "coda_list_rows",
  "List rows in a table with optional filtering and pagination. Returns slim rows by default (id, name, values) plus nextPageToken, which saves tokens. Set fields='voll' when you need the full row envelope (href, index, createdAt, updatedAt, browserLink).",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table to list rows from"),
    query: z.string().optional().describe("Query to filter rows (format: column_name:value)"),
    limit: z.number().int().positive().optional().describe("Maximum number of results to return"),
    sortBy: z.enum(["createdAt", "natural", "updatedAt"]).optional().describe("How to sort the results"),
    useColumnNames: z.boolean().optional().describe("Use column names instead of IDs in output"),
    visibleOnly: z.boolean().optional().describe("Return only visible rows and columns"),
    fields: z.enum(["schlank", "voll"]).optional().describe("schlank (default) = per row only id, name, values; saves tokens. voll = full API object incl. href, index, createdAt, updatedAt, browserLink."),
  },
  async ({ docId, tableIdOrName, query, limit, sortBy, useColumnNames, visibleOnly, fields }): Promise<CallToolResult> => {
    try {
      const resp = await listRows({
        path: { docId, tableIdOrName },
        query: { query, limit, sortBy, useColumnNames, visibleOnly },
        throwOnError: true,
      });

      const out = fields === "voll" ? resp.data : slimRows(resp.data);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to list rows : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_get_row",
  "Get detailed information about a specific row",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table containing the row"),
    rowIdOrName: z.string().describe("The ID or name of the row to get information about"),
    useColumnNames: z.boolean().optional().describe("Use column names instead of IDs in output"),
  },
  async ({ docId, tableIdOrName, rowIdOrName, useColumnNames }): Promise<CallToolResult> => {
    try {
      const resp = await getRow({
        path: { docId, tableIdOrName, rowIdOrName },
        query: { useColumnNames },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get row : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_create_rows",
  "Create or update multiple rows in a table",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table to add rows to"),
    rows: z.array(z.record(z.any())).describe("Array of row objects with column names/IDs as keys"),
    keyColumns: z.array(z.string()).optional().describe("Column IDs/names to use as upsert keys"),
  },
  async ({ docId, tableIdOrName, rows, keyColumns }): Promise<CallToolResult> => {
    try {
      const formattedRows = rows.map(row => ({
        cells: Object.entries(row).map(([column, value]) => ({
          column,
          value,
        })),
      }));

      const resp = await upsertRows({
        path: { docId, tableIdOrName },
        body: {
          rows: formattedRows,
          keyColumns,
        },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to create rows : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_update_row",
  "Update a specific row in a table",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table containing the row"),
    rowIdOrName: z.string().describe("The ID or name of the row to update"),
    values: z.record(z.any()).describe("Object with column names/IDs as keys and new values"),
  },
  async ({ docId, tableIdOrName, rowIdOrName, values }): Promise<CallToolResult> => {
    try {
      const cells = Object.entries(values).map(([column, value]) => ({
        column,
        value,
      }));

      const resp = await updateRow({
        path: { docId, tableIdOrName, rowIdOrName },
        body: {
          row: { cells },
        },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to update row : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_delete_row",
  "Delete a specific row from a table",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table containing the row"),
    rowIdOrName: z.string().describe("The ID or name of the row to delete"),
  },
  async ({ docId, tableIdOrName, rowIdOrName }): Promise<CallToolResult> => {
    try {
      const resp = await deleteRow({
        path: { docId, tableIdOrName, rowIdOrName },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to delete row : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_delete_rows",
  "Delete multiple rows from a table",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table to delete rows from"),
    rowIds: z.array(z.string()).describe("Array of row IDs to delete"),
  },
  async ({ docId, tableIdOrName, rowIds }): Promise<CallToolResult> => {
    try {
      const resp = await deleteRows({
        path: { docId, tableIdOrName },
        body: { rowIds },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to delete rows : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// FORMULA OPERATIONS
// ============================================================================

server.tool(
  "coda_list_formulas",
  "List all named formulas in a document",
  {
    docId: z.string().describe("The ID of the document to list formulas from"),
    limit: z.number().int().positive().optional().describe("Maximum number of results to return"),
    sortBy: z.enum(["name"]).optional().describe("How to sort the results"),
  },
  async ({ docId, limit, sortBy }): Promise<CallToolResult> => {
    try {
      const resp = await listFormulas({
        path: { docId },
        query: { limit, sortBy },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to list formulas : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_get_formula",
  "Get detailed information about a specific formula",
  {
    docId: z.string().describe("The ID of the document containing the formula"),
    formulaIdOrName: z.string().describe("The ID or name of the formula to get information about"),
  },
  async ({ docId, formulaIdOrName }): Promise<CallToolResult> => {
    try {
      const resp = await getFormula({
        path: { docId, formulaIdOrName },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get formula : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// CONTROL OPERATIONS
// ============================================================================

server.tool(
  "coda_list_controls",
  "List all controls (buttons, sliders, etc.) in a document",
  {
    docId: z.string().describe("The ID of the document to list controls from"),
    limit: z.number().int().positive().optional().describe("Maximum number of results to return"),
    sortBy: z.enum(["name"]).optional().describe("How to sort the results"),
  },
  async ({ docId, limit, sortBy }): Promise<CallToolResult> => {
    try {
      const resp = await listControls({
        path: { docId },
        query: { limit, sortBy },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to list controls : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_get_control",
  "Get detailed information about a specific control",
  {
    docId: z.string().describe("The ID of the document containing the control"),
    controlIdOrName: z.string().describe("The ID or name of the control to get information about"),
  },
  async ({ docId, controlIdOrName }): Promise<CallToolResult> => {
    try {
      const resp = await getControl({
        path: { docId, controlIdOrName },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get control : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_push_button",
  "Push a button control in a table row",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table containing the button"),
    rowIdOrName: z.string().describe("The ID or name of the row containing the button"),
    columnIdOrName: z.string().describe("The ID or name of the column containing the button"),
  },
  async ({ docId, tableIdOrName, rowIdOrName, columnIdOrName }): Promise<CallToolResult> => {
    try {
      const resp = await pushButton({
        path: { docId, tableIdOrName, rowIdOrName, columnIdOrName },
        throwOnError: true,
      });

      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to push button : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// USER AND ACCOUNT OPERATIONS
// ============================================================================

server.tool(
  "coda_whoami",
  "Get information about the current user",
  {},
  async (): Promise<CallToolResult> => {
    try {
      const resp = await whoami({ throwOnError: true });
      return { content: [{ type: "text", text: JSON.stringify(resp.data, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get user info : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// SEARCH AND QUERY OPERATIONS
// ============================================================================

server.tool(
  "coda_search_tables",
  "Search for tables across documents by name or content",
  {
    docId: z.string().describe("The ID of the document to search in"),
    query: z.string().describe("Search query to find tables"),
    tableTypes: z.array(z.enum(["table", "view"])).optional().describe("Filter by table types"),
  },
  async ({ docId, query, tableTypes }): Promise<CallToolResult> => {
    try {
      // First get all tables
      const tablesResp = await listTables({
        path: { docId },
        query: { tableTypes },
        throwOnError: true,
      });

      // Filter tables by name matching the query
      const filteredTables = tablesResp.data.items.filter(table => 
        table.name.toLowerCase().includes(query.toLowerCase())
      );

      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            items: filteredTables,
            searchQuery: query,
            totalFound: filteredTables.length 
          }, null, 2) 
        }] 
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to search tables : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

server.tool(
  "coda_search_pages",
  "Search for pages by name or content within a document",
  {
    docId: z.string().describe("The ID of the document to search in"),
    query: z.string().describe("Search query to find pages"),
    includeContent: z.boolean().optional().describe("Whether to also search page content (slower)"),
  },
  async ({ docId, query, includeContent = false }): Promise<CallToolResult> => {
    try {
      // Get all pages
      const pagesResp = await listPages({
        path: { docId },
        throwOnError: true,
      });

      let filteredPages = pagesResp.data.items.filter(page => 
        page.name.toLowerCase().includes(query.toLowerCase())
      );

      // If includeContent is true, also search page content
      if (includeContent) {
        const contentMatches = [];
        for (const page of pagesResp.data.items) {
          try {
            const content = await getPageContent(docId, page.id);
            if (content && content.toLowerCase().includes(query.toLowerCase())) {
              // Only add if not already in name matches
              if (!filteredPages.some(p => p.id === page.id)) {
                contentMatches.push({...page, matchedInContent: true});
              }
            }
          } catch (error) {
            // Skip pages where content can't be retrieved
            console.error(`Failed to get content for page ${page.id}:`, error);
          }
        }
        filteredPages = [...filteredPages, ...contentMatches];
      }

      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            items: filteredPages,
            searchQuery: query,
            searchedContent: includeContent,
            totalFound: filteredPages.length 
          }, null, 2) 
        }] 
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to search pages : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

server.tool(
  "coda_bulk_update_rows",
  "Update multiple rows in a table with different values",
  {
    docId: z.string().describe("The ID of the document containing the table"),
    tableIdOrName: z.string().describe("The ID or name of the table containing the rows"),
    updates: z.array(z.object({
      rowIdOrName: z.string().describe("The ID or name of the row to update"),
      values: z.record(z.any()).describe("Object with column names/IDs as keys and new values")
    })).describe("Array of row updates"),
  },
  async ({ docId, tableIdOrName, updates }): Promise<CallToolResult> => {
    try {
      const results = [];
      
      for (const update of updates) {
        try {
          const cells = Object.entries(update.values).map(([column, value]) => ({
            column,
            value,
          }));

          const resp = await updateRow({
            path: { docId, tableIdOrName, rowIdOrName: update.rowIdOrName },
            body: { row: { cells } },
            throwOnError: true,
          });

          results.push({ 
            rowId: update.rowIdOrName, 
            success: true, 
            data: resp.data 
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          results.push({
            rowId: update.rowIdOrName,
            success: false,
            error: errorMessage
          });
        }
      }

      return { 
        content: [{ 
          type: "text", 
          text: JSON.stringify({ 
            results,
            totalUpdates: updates.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
          }, null, 2) 
        }] 
      };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to bulk update rows : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);

// ============================================================================
// ANALYTICS AND INSIGHTS
// ============================================================================

server.tool(
  "coda_get_document_stats",
  "Get statistics and insights about a document",
  {
    docId: z.string().describe("The ID of the document to analyze"),
  },
  async ({ docId }): Promise<CallToolResult> => {
    try {
      // Get document info
      const docResp = await getDoc({ path: { docId }, throwOnError: true });
      
      // Get pages count
      const pagesResp = await listPages({ path: { docId }, throwOnError: true });
      
      // Get tables count
      const tablesResp = await listTables({ path: { docId }, throwOnError: true });
      
      // Get formulas count
      const formulasResp = await listFormulas({ path: { docId }, throwOnError: true });
      
      // Get controls count
      const controlsResp = await listControls({ path: { docId }, throwOnError: true });

      const stats = {
        document: {
          id: docResp.data.id,
          name: docResp.data.name,
          owner: docResp.data.owner,
          createdAt: docResp.data.createdAt,
          updatedAt: docResp.data.updatedAt,
          docSize: docResp.data.docSize,
        },
        counts: {
          pages: pagesResp.data.items.length,
          tables: tablesResp.data.items.filter(t => t.tableType === 'table').length,
          views: tablesResp.data.items.filter(t => t.tableType === 'view').length,
          formulas: formulasResp.data.items.length,
          controls: controlsResp.data.items.length,
        },
        breakdown: {
          tableNames: tablesResp.data.items.map(t => ({ name: t.name, type: t.tableType })),
          pageNames: pagesResp.data.items.slice(0, 10).map(p => p.name), // First 10 pages
          formulaNames: formulasResp.data.items.slice(0, 10).map(f => f.name), // First 10 formulas
        }
      };

      return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Failed to get document stats : ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  },
);
