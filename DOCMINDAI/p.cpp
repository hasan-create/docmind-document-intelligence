#include<iostream>
#include<vector>
#include<list>
#include<queue>
using namespace std;
class Graph{
    int V;
    list<int>*l;
public:
    Graph(int V){
        this->V=V;
        l=new list<int>[V];
    }    
void addEdge(int x,int y){
        l[x].push_back(y);
        l[y].push_back(x);
    }
void bfs(){
    queue<int>q;
    vector<bool>v(V,false);
    q.push(0);
    v[0]=true;
    while(q.size()>0){
        int u=q.front();
        q.pop();
        cout<<u<<" ";
        for(auto node:l[u]){
            if(!v[node]){
                q.push(node);
                v[node]=true;
            }
        }
    }

}
void dfsHelper(int u,vector<bool>&v){
    cout<<u<<" ";
    v[u]=true;
    for(auto node:l[u]){
        if(!v[node]){
            dfsHelper(node,v);
        }
    }
}
void dfs(){
    vector<bool>v(V,false);
    dfsHelper(0,v);
}
void printAdjList(){
    for(int i=0;i<V;i++){
        cout<<"Vertex "<<i<<"->";
        for(auto node:l[i]){
            cout<<node<<",";
        }
        cout<<endl;
    }
}
};
int main(){
    Graph g(5);
    g.addEdge(0,1);
    g.addEdge(1,2);
    g.addEdge(1,3);
    g.addEdge(2,4);
    g.bfs();
    cout<<endl;
    g.dfs();
    return 0;

}