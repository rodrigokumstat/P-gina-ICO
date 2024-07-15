const express = require('express');
const mysql = require('mysql');
const path = require('path');
const app = express();
const port = 3000;
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router(); // Certifique-se de criar o router aqui

// Middleware para processar o corpo das requisições POST
app.use(express.urlencoded({ extended: true }));

// Middleware para servir arquivos estáticos
app.use(express.static(path.join(__dirname)));

// Configuração do banco de dados
const dbConfig = {
  host: 'localhost',
  user: 'root', // Substitua pelo seu usuário
  password: '', // Substitua pela sua senha
  database: 'ico_database' // Substitua pelo nome do seu banco de dados
};

// Conexão com o MySQL
const connection = mysql.createConnection(dbConfig);
connection.connect((err) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
    return;
  }
  console.log('Conexão com o banco de dados MySQL estabelecida');
});

// Configuração do multer para upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Rota para definir a página inicial como index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'html/index.html'));
});

// Rota para validar login pelo ID
app.post('/login', (req, res) => {
  const { usuario, senha } = req.body;

  const query = 'SELECT * FROM usuarios WHERE usuario = ? AND senha = ?';
  connection.query(query, [usuario, senha], (err, results) => {
    if (err) {
      console.error('Erro ao executar consulta:', err);
      res.status(500).send('Erro interno do servidor');
      return;
    }

    if (results.length > 0) {
      const usuario = results[0];
      if (usuario.aprovado === 0) {
        return res.status(401).send('Seu acesso está bloqueado.');
      } else {
        res.status(200).send('Login bem-sucedido');
      }
    } else {
      res.status(401).send('Usuário ou senha incorretos');
    }
  });
});

// Rota para cadastrar usuários
app.post('/api/usuarios', (req, res) => {
  const { nome, sobrenome, data_nascimento, email, senha, usuario } = req.body;

  // Verifica se todos os campos obrigatórios foram enviados
  if (!nome || !sobrenome || !data_nascimento || !email || !senha || !usuario) {
    res.status(400).send('Todos os campos devem ser preenchidos.');
    return;
  }

  // Insere os dados no banco de dados
  const query = 'INSERT INTO usuarios (nome, sobrenome, data_nascimento, email, senha, usuario, aprovado) VALUES (?, ?, ?, ?, ?, ?, ?)';
  connection.query(query, [nome, sobrenome, data_nascimento, email, senha, usuario, false], (err, results) => {
    if (err) {
      console.error('Erro ao cadastrar usuário:', err);
      res.status(500).send('Erro ao cadastrar usuário.');
      return;
    }
    console.log('Usuário cadastrado com sucesso.');
    res.status(201).send('Usuário cadastrado com sucesso.');
  });
});

// Rota para importar dados do Excel para o banco de dados
app.post('/upload-excel', upload.single('nomeDoCampoDoArquivo'), (req, res) => {
    const jsonData = req.body;

  if (!jsonData || !jsonData.length) {
      return res.status(400).json({ success: false, message: 'Nenhum dado foi enviado para importação.' });
  }

  // Mapear e ajustar os dados para colunas opcionais, incluindo formatação do telefone
  const values = jsonData.map(row => [
      row.nome || null,
      row.idade || null,
      row.sexo || null,
      formatPhoneNumber(row.celular), // Formata o número de celular aqui
      row.email || null,
      row.curso || null
  ]);

  let filesLoaded = values.length; // Quantidade de arquivos carregados

  // Inserir dados no banco de dados com verificação de duplicatas
  const query = `
      INSERT INTO leads (nome, idade, sexo, telefone, email, curso)
      VALUES ?
      ON DUPLICATE KEY UPDATE
      nome = VALUES(nome),
      idade = VALUES(idade),
      sexo = VALUES(sexo),
      telefone = VALUES(telefone),
      curso = VALUES(curso);
  `;

  connection.query(query, [values], (err, results) => {
      if (err) {
          console.error('Erro ao inserir dados no banco:', err);
          return res.status(500).json({ success: false, message: 'Erro ao processar o arquivo.' });
      }

      let duplicatesIgnored = 0; // Contagem de duplicatas
      let loadErrors = 0; // Contagem de erros de carregamento

      // Verificar resultados para contar duplicatas e erros
      if (results && results.constructor.name === 'OkPacket') {
          if (results.insertId === 0) {
              duplicatesIgnored++; // Conta como duplicata se insertId for 0
          }
      } else {
          console.error('Resultado inesperado:', results);
          loadErrors = filesLoaded; // Considera todos como erros se não for um OkPacket
      }

      // Calcular sucesso e enviar resposta com as informações contadas
      const successCount = filesLoaded - duplicatesIgnored - loadErrors;

      res.status(200).json({
          success: true,
          message: 'Arquivo processado com sucesso.',
          filesLoaded: successCount,
          duplicatesIgnored: duplicatesIgnored,
          loadErrors: loadErrors
      });
  });
});

function formatPhoneNumber(phoneNumber) {
  // Implemente a lógica de formatação conforme necessário
  // Exemplo simples para remover espaços em branco
  return phoneNumber ? String(phoneNumber).replace(/\s/g, '') : null;
}
// Rota para validar se o usuário já existe
app.post('/api/usuarios/validar', (req, res) => {
  const { email } = req.body;

  // Verifica se o email já está cadastrado
  const query = 'SELECT * FROM usuarios WHERE email = ?';
  connection.query(query, [email], (err, results) => {
    if (err) {
      console.error('Erro ao validar usuário:', err);
      res.status(500).send('Erro interno do servidor.');
      return;
    }

    if (results.length > 0) {
      res.status(409).send('Já existe um usuário cadastrado com este email.');
    } else {
      res.status(200).send('Email disponível para cadastro.');
    }
  });
});

// Rota para buscar usuários não aprovados
app.get('/api/aprovacao', (req, res) => {
  const query = 'SELECT * FROM usuarios WHERE aprovado = 0'; // Consulta usuários não aprovados
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar usuários não aprovados:', err);
      res.status(500).send('Erro ao buscar usuários não aprovados.');
      return;
    }
    res.json(results); // Envia os usuários não aprovados como resposta
  });
});

// Rota para aprovar usuários
app.put('/api/aprovacao/:idUsuario', (req, res) => {
  const { idUsuario } = req.params;

  // Atualiza o status de aprovação do usuário
  const query = 'UPDATE usuarios SET aprovado = 1 WHERE id = ?';
  connection.query(query, [idUsuario], (err, results) => {
    if (err) {
      console.error('Erro ao aprovar usuário:', err);
      res.status(500).send('Erro ao aprovar usuário.');
      return;
    }
    console.log('Usuário aprovado com sucesso.');
    res.status(200).send('Usuário aprovado com sucesso.');
  });
});

// Rota para reprovar usuários
app.delete('/api/aprovacao/:idUsuario', (req, res) => {
  const { idUsuario } = req.params;

  // Remove o usuário do banco de dados
  const query = 'DELETE FROM usuarios WHERE id = ?';
  connection.query(query, [idUsuario], (err, results) => {
    if (err) {
      console.error('Erro ao reprovar usuário:', err);
      res.status(500).send('Erro ao reprovar usuário.');
      return;
    }
    console.log('Usuário reprovado com sucesso.');
    res.status(200).send('Usuário reprovado com sucesso.');
  });
});

// Rota para receber mensagens do chat
app.post('/enviar-mensagem', (req, res) => {
  const { nome, mensagem } = req.body;

  connection.query('INSERT INTO mensagens (nome, mensagem) VALUES (?, ?)', [nome, mensagem], (err, results) => {
    if (err) {
      console.error('Erro ao inserir a mensagem:', err);
      res.status(500).send('Erro ao enviar a mensagem.');
      return;
    }
    console.log('Mensagem enviada com sucesso.');
    res.status(200).send('Mensagem enviada com sucesso.');
  });
});

// Rota para receber os dados do formulário sala de aula
app.post('/enviar-dados-sala', (req, res) => {
  const { nome, idade, curso, professor, pergunta1, pergunta2, comentario } = req.body;

  // Verifica se todos os campos obrigatórios foram enviados
  if (!nome || !idade || !curso || !professor || !pergunta1 || !pergunta2) {
    res.status(400).send('Todos os campos devem ser preenchidos.');
    return;
  }

  // Insere os dados no banco de dados
  connection.query('INSERT INTO respostas_satisfacao (nome, idade, curso, professor, pergunta1, pergunta2, comentario) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [nome, idade, curso, professor, pergunta1, pergunta2, comentario], (err, results) => {
      if (err) {
        console.error('Erro ao inserir os dados na tabela respostas_satisfacao:', err);
        res.status(500).send('Erro ao enviar os dados.');
        return;
      }
      console.log('Dados inseridos na tabela respostas_satisfacao com sucesso.');
      res.sendFile(path.join(__dirname, 'html/success.html'));
    });
});

// Rota para receber os dados do formulário de contato
app.post('/enviar-contato', (req, res) => {
  const { nome, idade, sexo, telefone, email, curso, cidade, atendente, comparecimento, objecao, acoes } = req.body;

  connection.query('INSERT INTO leads (nome, idade, sexo, telefone, email, curso, cidade, atendente, comparecimento, objecao, acoes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [nome, idade, sexo, telefone, email, curso, cidade, atendente, comparecimento, objecao, acoes], (err, results) => {
      if (err) {
        console.error('Erro ao inserir os dados na tabela leads:', err);
        res.status(500).send('Erro ao enviar os dados.');
        return;
      }
      console.log('Dados inseridos na tabela leads com sucesso.');
      res.sendFile(path.join(__dirname, 'html/success-2.html'));
    });
});

// Rota para receber respostas de pesquisa
app.get('/respostas-pesquisa', (req, res) => {
  connection.query('SELECT * FROM respostas', (err, results) => {
    if (err) {
      console.error('Erro ao buscar respostas:', err);
      res.status(500).send('Erro ao buscar respostas.');
      return;
    }
    res.json(results);
  });
});

app.get('/respostas-satisfacao', (req, res) => {
  const query = `
    SELECT *,
           DATE_FORMAT(data_resposta, '%d/%m/%Y') AS data_formatada
    FROM respostas_satisfacao
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar respostas de satisfação:', err);
      res.status(500).send('Erro ao buscar respostas de satisfação.');
      return;
    }
    
    const formattedResults = results.map(result => ({
      ...result,
      data_resposta: result.data_formatada
    }));

    res.json(formattedResults);
  });
});

app.get('/api/tratamentos-mes', (req, res) => {
  const { startDate, endDate } = req.query;
  let whereClause = `WHERE tratamento IS NOT NULL AND tratamento != ''`;

  if (startDate && endDate) {
    whereClause += ` AND data_hora BETWEEN '${startDate}' AND '${endDate}'`;
  } else if (startDate) {
    whereClause += ` AND data_hora >= '${startDate}'`;
  } else if (endDate) {
    whereClause += ` AND data_hora <= '${endDate}'`;
  }

  const query = `
    SELECT 
      DATE_FORMAT(data_hora, '%Y-%m') AS mes_ano,
      tratamento,
      COUNT(*) AS total
    FROM 
      leads
    ${whereClause}
    GROUP BY 
      mes_ano, tratamento
    ORDER BY 
      mes_ano;
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar dados de tratamentos:', err);
      res.status(500).send('Erro ao buscar dados de tratamentos.');
      return;
    }

    results.forEach(entry => {
      entry.mes_ano = entry.mes_ano;
    });

    res.json(results);
  });
});
app.get('/leads', (req, res) => {
  const { startDate, endDate } = req.query;
  let whereClause = '';

  if (startDate && endDate) {
    whereClause = `WHERE data_hora BETWEEN '${startDate}' AND '${endDate}'`;
  } else if (startDate) {
    whereClause = `WHERE data_hora >= '${startDate}'`;
  } else if (endDate) {
    whereClause = `WHERE data_hora <= '${endDate}'`;
  }

  const query = `
    SELECT 
      id, nome, idade, sexo, telefone, email, curso, cidade, atendente, comparecimento, objecao, acoes, fonte, tratamento,
      DATE_FORMAT(data_hora, "%d/%m/%Y %H:%i:%s") AS dataHora,
      DATE_FORMAT(data_modificacao, "%d/%m/%Y %H:%i:%s") AS data_modificacao
    FROM 
      leads
    ${whereClause}
    ORDER BY 
      data_hora DESC;
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar LEADS:', err);
      res.status(500).send('Erro ao buscar LEADS.');
      return;
    }
    res.json(results);
  });
});
// Exemplo de middleware para fazer parse do corpo da requisição
app.use(express.json());

// Rota para editar um LEAD específico
app.put('/leads/:id', (req, res) => {
  const leadId = req.params.id;
  const { nome, idade, cidade, sexo, telefone, email, curso, atendente, comparecimento, objecao, fonte, tratamento } = req.body;

  // Continuar com a atualização do lead no banco de dados
  connection.query(
    'UPDATE leads SET nome=?, idade=?, cidade=?, sexo=?, telefone=?, email=?, curso=?, atendente=?, comparecimento=?, objecao=?, fonte=?, tratamento=?, data_modificacao=NOW() WHERE id=?', 
    [nome, idade, cidade, sexo, telefone, email, curso, atendente, comparecimento, objecao, fonte, tratamento, leadId], 
    (err, result) => {
      if (err) {
        console.error('Erro ao atualizar LEAD:', err);
        res.status(500).json({ error: 'Erro ao atualizar LEAD.' });
        return;
      }
      // Após a atualização, buscar o lead atualizado para enviar como resposta
      connection.query('SELECT * FROM leads WHERE id = ?', [leadId], (err, updatedLead) => {
        if (err) {
          console.error('Erro ao buscar o lead atualizado:', err);
          res.status(500).json({ error: 'Erro ao buscar o lead atualizado.' });
          return;
        }
        res.status(200).json(updatedLead[0]);
      });
    }
  );
});

app.get('/api/dados-leads', (req, res) => {
  const { startDate, endDate } = req.query;
  let whereClause = '';

  if (startDate && endDate) {
    whereClause = `WHERE data_hora BETWEEN '${startDate}' AND '${endDate}'`;
  } else if (startDate) {
    whereClause = `WHERE data_hora >= '${startDate}'`;
  } else if (endDate) {
    whereClause = `WHERE data_hora <= '${endDate}'`;
  }

  const query = `
    SELECT 
      DATE_FORMAT(data_hora, '%d/%m/%Y') AS data,
      COUNT(id) AS leads
    FROM 
      leads
    ${whereClause}
    GROUP BY 
      data
    ORDER BY 
      data_hora;
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar dados de leads:', err);
      res.status(500).send('Erro ao buscar dados de leads.');
      return;
    }
    res.json(results);
  });
});

// Rota para obter dados de respostas de satisfação por data, com filtro por datas
app.get('/api/dados-satisfacao', (req, res) => {
  const { startDate, endDate } = req.query;
  let whereClause = '';

  if (startDate && endDate) {
    whereClause = `WHERE data_resposta BETWEEN '${startDate}' AND '${endDate}'`;
  } else if (startDate) {
    whereClause = `WHERE data_resposta >= '${startDate}'`;
  } else if (endDate) {
    whereClause = `WHERE data_resposta <= '${endDate}'`;
  }

  const query = `
    SELECT 
      DATE(data_resposta) AS data,
      COUNT(id) AS respostas,
      YEAR(data_resposta) AS ano,
      MONTH(data_resposta) AS mes,
      DAY(data_resposta) AS dia
    FROM 
      respostas_satisfacao
    ${whereClause}
    GROUP BY 
      data, ano, mes, dia
    ORDER BY 
      ano, mes, dia;
  `;
  
  connection.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar dados de respostas de satisfação:', err);
      res.status(500).send('Erro ao buscar dados de respostas de satisfação');
      return;
    }
    res.json(results);
  });
});
// Rota para baixar leads em formato XLSX
router.get('/downloadXLSX', (req, res) => {
  try {
    const leadsData = req.leads; // Supondo que você tenha um middleware ou outra forma de obter os dados dos leads

    // Formatar os dados para o formato adequado para XLSX
    const wsData = leadsData.map(lead => [
      lead.id,
      lead.nome || '',
      lead.idade || '',
      lead.cidade || '',
      lead.sexo || '',
      lead.telefone || '',
      lead.email || '',
      lead.curso || '',
      formatarDataHora(lead.dataHora) || '',
      lead.atendente || '',
      lead.comparecimento || '',
      lead.objecao || '',
      lead.fonte || '',
      lead.tratamento || '',
      formatarDataHora(lead.data_modificacao) || ''
    ]);

    // Adicionar cabeçalhos
    wsData.unshift([
      "ID", "Nome", "Idade", "Cidade", "Sexo", "Telefone", "Email", "Curso", "Data/Hora",
      "Atendente", "Comparecimento", "Objeção", "Fonte", "Tratamento", "Data de Modificação"
    ]);

    // Criar workbook e worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Leads");

    // Gerar o arquivo XLSX e enviar para o cliente
    const xlsxBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    res.setHeader('Content-Disposition', 'attachment; filename=leads.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(xlsxBuffer);
  } catch (error) {
    console.error('Erro ao gerar arquivo XLSX:', error);
    res.status(500).send('Erro ao gerar arquivo XLSX');
  }
});
// Rota para adicionar aluno
app.post('/adicionar-aluno', (req, res) => {
  const { nome, matricula } = req.body;
  const query = 'INSERT INTO alunos (nome, matricula) VALUES (?, ?)';
  connection.query(query, [nome, matricula], (error, results, fields) => {
      if (error) throw error;
      res.json({ message: 'Aluno adicionado com sucesso!', id: results.insertId });
  });
});

// Rota para remover aluno
app.delete('/remover-aluno/:id', (req, res) => {
  const idAluno = req.params.id;
  const query = 'DELETE FROM alunos WHERE id_aluno = ?';
  connection.query(query, [idAluno], (error, results, fields) => {
      if (error) throw error;
      res.json({ message: 'Aluno removido com sucesso!' });
  });
});

// Rota para marcar presença/falta
app.post('/registrar-presenca', (req, res) => {
  const { id_aluno, presenca } = req.body;
  const data = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const query = 'INSERT INTO registro_presenca (id_aluno, data, presenca) VALUES (?, ?, ?)';
  connection.query(query, [id_aluno, data, presenca], (error, results, fields) => {
      if (error) throw error;
      res.json({ message: 'Registro de presença realizado com sucesso!' });
  });
});
// Rota para o painel de controle do colaborador
app.get('/dashboard.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'html/dashboard.html'));
});

// Altere esta linha para ouvir em todas as interfaces
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://0.0.0.0:${port}`);
});
