import React, { useState } from "react";
import * as XLSX from "xlsx";
import { Download, UploadCloud, X, CheckCircle, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminSubjects, useAdminTopics, useBulkCreateQuestions } from "@/hooks/useAdminData";
import { supabase } from "@/lib/supabase";

interface AdminQuestionImportProps {
  onClose: () => void;
  presetSubjectId?: number;
}

function normalizeName(str: string): string {
  return (str || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function preserveExcelText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

export function AdminQuestionImport({ onClose }: AdminQuestionImportProps) {
  const [file, setFile] = useState<File | null>(null);
  
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  
  const { data: subjects = [] } = useAdminSubjects();
  const { data: topics = [] } = useAdminTopics();
  const bulkCreate = useBulkCreateQuestions();

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        ORIGEM: "CESPE",
        MATERIA: "Geografia",
        TEMA: "Capitais",
        FORMATO: "mc",
        ENUNCIADO: "Qual a capital do Brasil?",
        LETRA_A: "Rio de Janeiro",
        LETRA_B: "São Paulo",
        LETRA_C: "Brasília",
        LETRA_D: "Acre",
        LETRA_E: "Paraná",
        CORRETA: "C",
        JUSTIFICATIVA: "Brasília foi construída para ser a capital.",
        DIFICULDADE: "f"
      },
      {
        ORIGEM: "IA",
        MATERIA: "Geografia",
        TEMA: "Planeta",
        FORMATO: "vf",
        ENUNCIADO: "A Terra é redonda.",
        LETRA_A: "",
        LETRA_B: "",
        LETRA_C: "",
        LETRA_D: "",
        LETRA_E: "",
        CORRETA: "V",
        JUSTIFICATIVA: "Fato comprovado.",
        DIFICULDADE: "fácil"
      }
    ]);
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "Modelo_Importacao_Questoes.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);
        
        validateAndParse(data);
      } catch (err) {
        setErrors(["Erro ao ler arquivo. Certifique-se que é um formato XLSX válido."]);
      }
    };
    reader.readAsBinaryString(selected);
  };

  const validateAndParse = (rows: any[]) => {
    const newErrors: string[] = [];
    const validRows: any[] = [];
    
    rows.forEach((row, index) => {
      const line = index + 2; // +1 for 0-index, +1 for header
      
      let format = String(row.FORMATO || "").toLowerCase().trim();
      if (!format || format === "" || format === "multipla" || format === "escolha") format = "multiple_choice";
      if (format === "mc" || format === "m" || format === "múltipla" || format === "multipla" || format === "escolha" || format === "múltipla escolha" || format === "multipla escolha") format = "multiple_choice";
      if (format === "vf" || format === "v/f" || format === "verdadeiro" || format === "falso" || format === "verdadeiro ou falso") format = "true_false";

      const statement = preserveExcelText(row.ENUNCIADO);
      
      // Garantir que o gabarito seja extraído corretamente
      let corRaw = row.CORRETA;
      let cor = "";
      
      // Tratar diferentes tipos de dados vindos do Excel
      if (corRaw === null || corRaw === undefined || corRaw === "") {
        cor = "";
      } else if (typeof corRaw === "number") {
        // Se for número, converter para letra (1=A, 2=B, etc)
        if (corRaw >= 1 && corRaw <= 5) {
          cor = String.fromCharCode(64 + corRaw);
        } else {
          cor = String(corRaw);
        }
      } else {
        cor = String(corRaw).toUpperCase().trim();
      }
      
      let diff = String(row.DIFICULDADE || "").toLowerCase().trim();
      if (diff === "f" || diff === "facil" || diff === "fácil") diff = "easy";
      else if (diff === "m" || diff === "medio" || diff === "médio") diff = "medium";
      else if (diff === "d" || diff === "dificil" || diff === "difícil") diff = "hard";
      else diff = "medium";

      const subjectName = String(row.MATERIA || "Geral").trim();
      const topicName = String(row.TEMA || "").trim();
      const sourceText = String(row.ORIGEM || "IA").trim();

      if (!statement) {
        newErrors.push(`Linha ${line}: ENUNCIADO está vazio.`);
        return;
      }
      if (format !== "multiple_choice" && format !== "true_false") {
        newErrors.push(`Linha ${line}: FORMATO inválido. Use 'mc' para múltipla e 'vf' para V/F.`);
        return;
      }
      
      const upperCor = cor.toUpperCase();
      
      if (format === "true_false") {
        if (upperCor !== "V" && upperCor !== "F" && upperCor !== "C" && upperCor !== "E") {
          newErrors.push(`Linha ${line}: CORRETA deve ser V ou F para questões true_false.`);
          return;
        }
      } else {
        if (!["A", "B", "C", "D", "E"].includes(upperCor)) {
          newErrors.push(`Linha ${line}: CORRETA deve ser A, B, C, D ou E para questões de múltipla escolha.`);
          return;
        }
        if (!row.LETRA_A || !row.LETRA_B || !row.LETRA_C || !row.LETRA_D) {
          newErrors.push(`Linha ${line}: Questões de múltipla escolha exigem no mínimo opções de A até D preenchidas.`);
          return;
        }
      }

      validRows.push({
        _subjectText: subjectName,
        _topicText: topicName,
        _sourceText: sourceText,
        format,
        statement,
        option_a: format === "multiple_choice" ? preserveExcelText(row.LETRA_A) : "",
        option_b: format === "multiple_choice" ? preserveExcelText(row.LETRA_B) : "",
        option_c: format === "multiple_choice" ? preserveExcelText(row.LETRA_C) : "",
        option_d: format === "multiple_choice" ? preserveExcelText(row.LETRA_D) : "",
        option_e: format === "multiple_choice" ? preserveExcelText(row.LETRA_E) : "",
        correct_option: format === "true_false" ? (upperCor === "C" ? "V" : upperCor === "E" ? "F" : upperCor) : upperCor,
        explanation: preserveExcelText(row.JUSTIFICATIVA),
        difficulty: diff,
        is_active: true,
        status: "published",
        edict_id: 1, 
      });
    });

    setErrors(newErrors);
    setParsedData(validRows);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;
    setIsImporting(true);

    try {
      const payload = [];
      let localSubjects = [...subjects];
      let localTopics = [...topics];

      const { data: boardsData } = await supabase.from('exam_boards').select('id, name');
      let localBoards = boardsData || [];

      for (const q of parsedData) {
        let subj = localSubjects.find(s => normalizeName(s.name) === normalizeName(q._subjectText));
        if (!subj) {
          const { data, error } = await supabase.from('subjects').insert({ 
            name: q._subjectText, 
            course_id: 1, 
            is_active: true 
          }).select().single();
          
          if (error) throw new Error(`Falha ao criar matéria '${q._subjectText}': ${error.message}`);
          subj = data;
          localSubjects.push(subj);
        }

        let topicId = null;
        if (q._topicText) {
          let top = localTopics.find(t => normalizeName(t.name) === normalizeName(q._topicText) && t.subject_id === subj.id);
          if (!top) {
            const { data, error } = await supabase.from('topics').insert({ 
              name: q._topicText, 
              subject_id: subj.id,
              sort_order: 0
            }).select().single();

            if (error) throw new Error(`Falha ao criar tema '${q._topicText}': ${error.message}`);
            top = data;
            localTopics.push(top);
          }
          topicId = top.id;
        }

        let boardId = null;
        let qType = "ia";
        if (q._sourceText.toUpperCase() !== "IA") {
          qType = "banca";
          let board = localBoards.find(b => normalizeName(b.name) === normalizeName(q._sourceText));
          if (!board) {
             const { data, error } = await supabase.from('exam_boards').insert({ name: q._sourceText }).select().single();
             if (error) throw new Error(`Falha ao criar banca/concurso '${q._sourceText}': ${error.message}`);
             board = data;
             localBoards.push(board);
          }
          boardId = board.id;
        }

        const { _subjectText, _topicText, _sourceText, ...rest } = q;
        payload.push({
          ...rest,
          subject_id: subj.id,
          topic_id: topicId,
          board_id: boardId,
          question_type: qType
        });
      }

      bulkCreate.mutate(payload, {
        onSuccess: () => {
          alert(`${payload.length} questões importadas com sucesso!`);
          setIsImporting(false);
          onClose();
        },
        onError: (err: any) => {
          alert(err.message || "Erro desconhecido ao importar no banco de dados.");
          setIsImporting(false);
        }
      });
    } catch (e: any) {
      alert(e.message || "Erro durante o processamento das categorias.");
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-2xl overflow-hidden animate-slide-up flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg"><FileSpreadsheet className="w-5 h-5 text-primary" /></div>
            <div>
              <h2 className="font-bold text-lg text-foreground">Importar Questões (XLSX)</h2>
              <p className="text-sm text-muted-foreground">Adicione várias questões de uma vez</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-xl transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Step 1: Download Template */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">1. Baixe o Modelo Padrão</h3>
            <p className="text-sm text-muted-foreground">Utilize nossa planilha formatada corretamente para o upload. Não altere os nomes das colunas na primeira linha.</p>
            <button onClick={handleDownloadTemplate} className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-semibold hover:bg-secondary/80 transition-colors">
              <Download className="h-4 w-4" /> Baixar Modelo
            </button>
          </div>

          <div className="h-px bg-border w-full"></div>

          {/* Step 2: Upload */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-foreground">2. Enviar Planilha Preenchida</h3>
            <label className={cn("flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors", file ? "border-success bg-success/5" : "border-border hover:border-primary/50 hover:bg-muted/50")}>
              <UploadCloud className={cn("w-8 h-8 mb-3", file ? "text-success" : "text-muted-foreground")} />
              <span className="text-sm font-semibold">{file ? file.name : "Clique para anexar arquivo .xlsx"}</span>
              <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {/* Feedback & Report */}
          {file && (
            <div className="space-y-3 bg-muted/50 p-4 rounded-xl border border-border">
               <h3 className="font-bold text-sm">Relatório de Leitura</h3>
               <div className="flex gap-4 mb-2">
                 <div className="flex items-center gap-1.5 text-sm text-success"><CheckCircle className="w-4 h-4" /> {parsedData.length} prontas para importar</div>
                 {errors.length > 0 && <div className="flex items-center gap-1.5 text-sm text-destructive"><AlertTriangle className="w-4 h-4" /> {errors.length} com erros</div>}
               </div>
               
               {errors.length > 0 && (
                 <div className="max-h-32 overflow-y-auto space-y-1 mt-3">
                   {errors.map((err, i) => (
                     <div key={i} className="text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">{err}</div>
                   ))}
                 </div>
               )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-border flex justify-end gap-3 bg-muted/30">
          <button onClick={onClose} disabled={isImporting} className="px-4 py-2 font-semibold text-sm rounded-lg bg-background border border-border hover:bg-muted transition-colors disabled:opacity-50">Cancelar</button>
          <button onClick={handleImport} disabled={parsedData.length === 0 || isImporting} className="px-4 py-2 font-semibold text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
            {isImporting && <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />}
            {isImporting ? "Gerando base..." : "Finalizar Importação"}
          </button>
        </div>
      </div>
    </div>
  );
}
